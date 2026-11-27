$ErrorActionPreference = 'Stop'

$projectName = "saulat-smoke-$PID"
$containerName = "$projectName-app"
$imageName = "$projectName-app"
$port = 39117

try {
  docker compose -p $projectName build app

  $containerId = (docker run --name $containerName -d `
    -p "127.0.0.1:${port}:3000" `
    -e NODE_ENV=production `
    -e OLLAMA_URL= `
    -e INCLUDE_DRAFT=0 `
    $imageName | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or -not $containerId) { throw "Docker run failed for image $imageName." }

  $health = $null
  for ($attempt = 1; $attempt -le 30; $attempt += 1) {
    try {
      $healthJson = (docker exec $containerName node -e "fetch('http://127.0.0.1:3000/api/health').then(async r => { if (!r.ok) process.exit(2); process.stdout.write(await r.text()); }).catch(() => process.exit(3))" | Out-String).Trim()
      if ($LASTEXITCODE -eq 0 -and $healthJson) {
        $health = $healthJson | ConvertFrom-Json
        break
      }
    } catch {
      Start-Sleep -Seconds 1
    }
  }
  if (-not $health) {
    docker ps -a --filter "name=$containerName" | Out-String | Write-Output
    docker logs $containerName 2>&1 | Write-Output
    throw 'Container did not answer /api/health within 30 seconds.'
  }
  if ($health.ai -ne 'fallback') { throw "Expected fallback without Ollama, got: $($health.ai)" }
  if ($health.includeDraft -ne $false) { throw 'Production container must not include draft content.' }
  Write-Output ("Docker smoke PASS: health 200, ai={0}, includeDraft={1}, contentVersion={2}" -f $health.ai, $health.includeDraft, $health.contentVersion)
} finally {
  try { docker rm -f $containerName 2>$null | Out-Null } catch { }
  try { docker compose -p $projectName down --remove-orphans 2>$null | Out-Null } catch { }
}
