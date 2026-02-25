# i18n Translator – Start both servers
# Usage: .\start.ps1 [B_API_KEY=your-key]

param(
    [string]$ApiKey = $env:B_API_KEY
)

if ($ApiKey) {
    $env:B_API_KEY = $ApiKey
    Write-Host "B_API_KEY set." -ForegroundColor Green
} else {
    Write-Host "No B_API_KEY set. AI translation will be disabled." -ForegroundColor Yellow
}

Write-Host "`nStarting backend (FastAPI on :8000)..." -ForegroundColor Cyan
$backend = Start-Process -PassThru -NoNewWindow powershell -ArgumentList `
    "-Command", "cd '$PSScriptRoot\backend'; uvicorn main:app --reload --port 8000"

Write-Host "Starting frontend (Vite on :5173)..." -ForegroundColor Cyan
$frontend = Start-Process -PassThru -NoNewWindow powershell -ArgumentList `
    "-Command", "cd '$PSScriptRoot\frontend'; npm run dev"

Write-Host "`n  Backend:  http://localhost:8000" -ForegroundColor White
Write-Host "  Frontend: http://localhost:5173" -ForegroundColor White
Write-Host "  API docs: http://localhost:8000/docs`n" -ForegroundColor White
Write-Host "Press Ctrl+C to stop..." -ForegroundColor Gray

try {
    Wait-Process -Id $backend.Id
} finally {
    Stop-Process -Id $frontend.Id -ErrorAction SilentlyContinue
}
