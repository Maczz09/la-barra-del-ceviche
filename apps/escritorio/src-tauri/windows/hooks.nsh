!macro NSIS_HOOK_POSTINSTALL
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="La Barra del Ceviche - RestoApp Web"'
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="La Barra del Ceviche - RestoApp mDNS"'
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="La Barra del Ceviche - RestoApp Web" dir=in action=allow program="$INSTDIR\runtime\node\node.exe" protocol=TCP localport=3210 profile=private enable=yes'
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="La Barra del Ceviche - RestoApp mDNS" dir=in action=allow program="$INSTDIR\runtime\node\node.exe" protocol=UDP localport=5353 profile=private enable=yes'
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="La Barra del Ceviche - RestoApp Web"'
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="La Barra del Ceviche - RestoApp mDNS"'
!macroend
