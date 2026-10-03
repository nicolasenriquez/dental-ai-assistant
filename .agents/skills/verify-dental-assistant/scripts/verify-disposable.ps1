$ErrorActionPreference = 'Stop'
$verificationRoot = (Resolve-Path (Join-Path $PSScriptRoot '../../../..')).Path
$verificationProject = 'ai-tutor-verification'
$verificationCompose = Join-Path $PSScriptRoot 'compose.verify.yml'
$verificationArgs = @('compose', '-p', $verificationProject, '--project-directory', $verificationRoot, '--env-file', (Join-Path $verificationRoot '.env'), '-f', $verificationCompose)
$verificationExisting = & docker @verificationArgs ps -a -q
if ($LASTEXITCODE -ne 0) { throw 'Could not inspect verification project ownership' }
if ($verificationExisting) { throw 'Verification project already exists; refusing to double-drive or remove it' }
$verificationVolumes = & docker volume ls --filter "label=com.docker.compose.project=$verificationProject" --format '{{.Name}}'
if ($LASTEXITCODE -ne 0) { throw 'Could not inspect verification volumes' }
$verificationNetworks = & docker network ls --filter "label=com.docker.compose.project=$verificationProject" --format '{{.Name}}'
if ($LASTEXITCODE -ne 0) { throw 'Could not inspect verification networks' }
if ($verificationVolumes -or $verificationNetworks) { throw 'Verification project has existing resources; refusing to reuse or remove them' }
$verificationOwned = $false
$verificationExit = 1
$verificationRun = 'disposable-' + [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ')
$verificationEvidence = Join-Path $verificationRoot ".playwright-cli/verification/$verificationRun"
New-Item -ItemType Directory -Path $verificationEvidence -Force | Out-Null
$verificationLaunch = @{ project = $verificationProject; port = 8002; startup = 'pending'; cleanup = 'pending' }
$verificationLaunch | ConvertTo-Json | Set-Content (Join-Path $verificationEvidence 'launch.json')
try {
    # Ownership is established before launch so partial startup is cleaned on failure.
    $verificationOwned = $true
    & docker @verificationArgs up -d --build --wait --wait-timeout 180
    if ($LASTEXITCODE -ne 0) { throw 'Verification stack startup failed' }
    $verificationLaunch.startup = 'ready'
    $env:VERIFY_OWNED_PROJECT = $verificationProject
    $env:VERIFY_RUN_ID = $verificationRun
    & bun (Join-Path $PSScriptRoot 'verify-local.cjs') --disposable
    $verificationExit = $LASTEXITCODE
} finally {
    Remove-Item Env:VERIFY_OWNED_PROJECT -ErrorAction SilentlyContinue
    Remove-Item Env:VERIFY_RUN_ID -ErrorAction SilentlyContinue
    if ($verificationOwned) {
        & docker @verificationArgs down --volumes
        if ($LASTEXITCODE -ne 0) {
            $verificationExit = 1
            $verificationLaunch.cleanup = 'failed'
        } else {
            $verificationLaunch.cleanup = 'containers and dedicated volume removed'
        }
    }
    $verificationLaunch | ConvertTo-Json | Set-Content (Join-Path $verificationEvidence 'launch.json')
    if (!(Test-Path (Join-Path $verificationEvidence 'report.json'))) { $verificationExit = 1 }
    Write-Output "Verification evidence retained at $verificationEvidence"
}
exit $verificationExit
