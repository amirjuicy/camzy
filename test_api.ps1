$body = @{items=@()} | ConvertTo-Json -Compress
Invoke-WebRequest -Method POST -Uri 'http://localhost:3000/api/orders' -ContentType 'application/json' -Body $body