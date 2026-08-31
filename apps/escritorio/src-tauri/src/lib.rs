mod printer;

use std::{
    fs::{self, OpenOptions},
    io::Write,
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex},
    time::Duration,
};
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Manager,
};
use tauri_plugin_autostart::ManagerExt;

type RuntimeChild = Arc<Mutex<Option<Child>>>;

fn report_startup_error(app: &AppHandle, error: &str) {
    if let Ok(data) = app.path().app_local_data_dir() {
        let logs = data.join("logs");
        let _ = fs::create_dir_all(&logs);
        if let Ok(mut log) = OpenOptions::new()
            .create(true)
            .append(true)
            .open(logs.join("desktop-runtime.log"))
        {
            let _ = writeln!(log, "RESTOAPP_DESKTOP_FATAL {error}");
        }
    }

    if let Some(window) = app.get_webview_window("main") {
        let message = serde_json::to_string(error)
            .unwrap_or_else(|_| "\"Error desconocido al iniciar el servidor local\"".into());
        let script = format!(
            "document.querySelector('h1').textContent='No se pudo iniciar el servidor';\
             document.querySelector('p').textContent={message};\
             document.querySelector('.dots').style.display='none';"
        );
        let _ = window.eval(&script);
        let _ = window.set_title("La Barra del Ceviche · Error al iniciar servidor");
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn launch_runtime(app: &AppHandle) -> Result<Child, String> {
    let resources = app.path().resource_dir().map_err(|error| error.to_string())?;
    let data = app.path().app_local_data_dir().map_err(|error| error.to_string())?;
    fs::create_dir_all(data.join("logs")).map_err(|error| error.to_string())?;
    let node = resources.join("runtime/node/node.exe");
    let runtime_directory = resources.join("runtime/runtime-local");
    let entry = runtime_directory.join("main.js");
    if !node.is_file() {
        return Err(format!("No se encontró Node.js en {}", node.display()));
    }
    if !entry.is_file() {
        return Err(format!("No se encontró el runtime local en {}", entry.display()));
    }
    let stdout = OpenOptions::new().create(true).append(true).open(data.join("logs/desktop-runtime.log")).map_err(|error| error.to_string())?;
    let stderr = stdout.try_clone().map_err(|error| error.to_string())?;
    let mut command = Command::new(&node);
    command.current_dir(&runtime_directory)
        .arg("main.js")
        .env("RESTOAPP_RESOURCES_DIR", &resources)
        .env("RESTOAPP_DATA_DIR", &data)
        .stdin(Stdio::null()).stdout(stdout).stderr(stderr);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000);
    }
    command.spawn().map_err(|error| format!("No se pudo iniciar el runtime local: {error}"))
}

async fn wait_and_open(app: AppHandle) {
    let client = reqwest::Client::new();
    for _ in 0..300 {
        if client.get("http://127.0.0.1:3210/local-info").send().await.map(|response| response.status().is_success()).unwrap_or(false) {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.navigate(url::Url::parse("http://127.0.0.1:3210").expect("URL local válida"));
                let _ = window.show();
                let _ = window.set_focus();
            }
            tokio::spawn(printer::run_worker());
            return;
        }
        tokio::time::sleep(Duration::from_secs(1)).await;
    }
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_title("La Barra del Ceviche · Error al iniciar servidor");
    }
}

fn build_tray(app: &tauri::App) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Abrir RestoApp", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Cerrar servidor", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;
    TrayIconBuilder::new()
        .icon(app.default_window_icon().expect("icono configurado").clone())
        .tooltip("La Barra del Ceviche · Servidor activo")
        .menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => if let Some(window) = app.get_webview_window("main") { let _ = window.show(); let _ = window.set_focus(); },
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;
    Ok(())
}

pub fn run() {
    let runtime: RuntimeChild = Arc::new(Mutex::new(None));
    let runtime_setup = runtime.clone();
    let runtime_exit = runtime.clone();

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") { let _ = window.show(); let _ = window.set_focus(); }
        }))
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .setup(move |app| {
            build_tray(app)?;
            if !app.autolaunch().is_enabled().unwrap_or(false) { let _ = app.autolaunch().enable(); }
            match launch_runtime(app.handle()) {
                Ok(child) => {
                    *runtime_setup.lock().expect("runtime mutex") = Some(child);
                    tauri::async_runtime::spawn(wait_and_open(app.handle().clone()));
                }
                Err(error) => report_startup_error(app.handle(), &error),
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("No se pudo construir La Barra del Ceviche");

    app.run(move |_app, event| {
        if let tauri::RunEvent::Exit = event {
            let _ = reqwest::blocking::Client::new()
                .post("http://127.0.0.1:3210/local-admin/shutdown")
                .timeout(Duration::from_secs(3))
                .send();
            std::thread::sleep(Duration::from_millis(750));
            if let Some(mut child) = runtime_exit.lock().expect("runtime mutex").take() {
                if child.try_wait().ok().flatten().is_none() { let _ = child.kill(); }
                let _ = child.wait();
            }
        }
    });
}
