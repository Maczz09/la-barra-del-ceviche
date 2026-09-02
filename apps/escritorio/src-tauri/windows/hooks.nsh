!macro NSIS_HOOK_PREINSTALL
  DetailPrint "Cerrando La Barra del Ceviche para actualizar..."
  ; El cierre HTTP permite que PostgreSQL/NATS y los microservicios terminen
  ; limpiamente. taskkill cierra después la ventana que normalmente queda en
  ; la bandeja y /T limita el fallback al árbol de esta aplicación.
  nsExec::ExecToLog 'powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -Command "try { Invoke-WebRequest -UseBasicParsing -Method Post -Uri http://127.0.0.1:3210/local-admin/shutdown -TimeoutSec 3 | Out-Null } catch {}"'
  Sleep 2500
  nsExec::ExecToLog 'taskkill.exe /IM "la-barra-del-ceviche.exe" /T /F'
  Sleep 1000
!macroend

!macro NSIS_HOOK_POSTINSTALL
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="La Barra del Ceviche - RestoApp Web"'
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="La Barra del Ceviche - RestoApp mDNS"'
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="La Barra del Ceviche - RestoApp Web" dir=in action=allow program="$INSTDIR\runtime\node\node.exe" protocol=TCP localport=3210 remoteip=localsubnet profile=any enable=yes'
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="La Barra del Ceviche - RestoApp Web"'
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="La Barra del Ceviche - RestoApp mDNS"'
!macroend
