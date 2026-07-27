; DEPRECATED — Stage 5 cutover
; Official installer lives at: sasist-agent\installer\SasistAgent.iss
; Build via: installer\build.ps1  (delegates to sasist-agent\scripts\publish-release.ps1)
;
; This file is intentionally empty of install logic so root cannot produce
; a second/legacy Python agent installer.

#error "Do not compile this script. Use installer\build.ps1 → sasist-agent\installer\SasistAgent.iss"
