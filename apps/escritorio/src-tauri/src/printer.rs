use base64::{engine::general_purpose::STANDARD, Engine as _};
use reqwest::Client;
use serde::Deserialize;
use serde_json::json;
use std::{ffi::c_void, ptr, time::Duration};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PrintJob {
    id: String,
    printer_name: String,
    payload_base64: String,
    copies: u8,
}

pub async fn run_worker() {
    let client = Client::new();
    loop {
        if let Ok(response) = client.get("http://127.0.0.1:3210/local-admin/print/next").send().await {
            if let Ok(Some(job)) = response.json::<Option<PrintJob>>().await {
                let result = print_job(&job);
                let (action, body) = match result {
                    Ok(()) => ("complete", json!({})),
                    Err(error) => ("fail", json!({ "error": error })),
                };
                let _ = client
                    .post(format!("http://127.0.0.1:3210/local-admin/print/{}/{action}", job.id))
                    .json(&body)
                    .send()
                    .await;
            }
        }
        tokio::time::sleep(Duration::from_secs(1)).await;
    }
}

fn print_job(job: &PrintJob) -> Result<(), String> {
    let payload = STANDARD.decode(&job.payload_base64).map_err(|error| error.to_string())?;
    for _ in 0..job.copies.max(1) {
        raw_print(&job.printer_name, &payload)?;
    }
    Ok(())
}

#[cfg(windows)]
fn raw_print(printer_name: &str, bytes: &[u8]) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;

    #[repr(C)]
    struct DocInfo1W { doc_name: *const u16, output_file: *const u16, data_type: *const u16 }

    #[link(name = "Winspool")]
    extern "system" {
        fn OpenPrinterW(name: *const u16, handle: *mut *mut c_void, defaults: *mut c_void) -> i32;
        fn ClosePrinter(handle: *mut c_void) -> i32;
        fn StartDocPrinterW(handle: *mut c_void, level: u32, doc_info: *const DocInfo1W) -> u32;
        fn EndDocPrinter(handle: *mut c_void) -> i32;
        fn StartPagePrinter(handle: *mut c_void) -> i32;
        fn EndPagePrinter(handle: *mut c_void) -> i32;
        fn WritePrinter(handle: *mut c_void, buffer: *const c_void, count: u32, written: *mut u32) -> i32;
    }

    fn wide(value: &str) -> Vec<u16> { std::ffi::OsStr::new(value).encode_wide().chain(Some(0)).collect() }
    let printer = wide(printer_name);
    let title = wide("Comanda La Barra del Ceviche");
    let raw = wide("RAW");
    let mut handle = ptr::null_mut();
    unsafe {
        if OpenPrinterW(printer.as_ptr(), &mut handle, ptr::null_mut()) == 0 { return Err("Windows no pudo abrir la impresora".into()); }
        let info = DocInfo1W { doc_name: title.as_ptr(), output_file: ptr::null(), data_type: raw.as_ptr() };
        if StartDocPrinterW(handle, 1, &info) == 0 { ClosePrinter(handle); return Err("No se pudo iniciar el documento RAW".into()); }
        if StartPagePrinter(handle) == 0 { EndDocPrinter(handle); ClosePrinter(handle); return Err("No se pudo iniciar la página".into()); }
        let mut written = 0;
        let ok = WritePrinter(handle, bytes.as_ptr().cast(), bytes.len() as u32, &mut written);
        EndPagePrinter(handle); EndDocPrinter(handle); ClosePrinter(handle);
        if ok == 0 || written != bytes.len() as u32 { return Err(format!("Impresión incompleta: {written}/{} bytes", bytes.len())); }
    }
    Ok(())
}

#[cfg(not(windows))]
fn raw_print(_printer_name: &str, _bytes: &[u8]) -> Result<(), String> {
    Err("La impresión automática requiere Windows".into())
}
