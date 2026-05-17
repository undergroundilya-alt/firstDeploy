# 13. Server-gate integration examples

## Node / Express example

```js
app.post('/protected-content', async (req, res) => {
  const result = await fetch('https://YOUR-SAAS-DOMAIN/api/v1/server/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectKey: process.env.AVP_PROJECT_KEY,
      secretKey: process.env.AVP_SECRET_KEY,
      visitorToken: req.body.visitorToken
    })
  }).then(r => r.json());

  if (!result.allowed) {
    return res.status(403).json({ error: 'ad_visibility_not_confirmed' });
  }

  res.json({ html: '<article>Protected content...</article>' });
});
```

## PHP example

```php
$payload = json_encode([
  'projectKey' => getenv('AVP_PROJECT_KEY'),
  'secretKey' => getenv('AVP_SECRET_KEY'),
  'visitorToken' => $_POST['visitorToken'] ?? ''
]);

$ch = curl_init('https://YOUR-SAAS-DOMAIN/api/v1/server/verify');
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
$response = json_decode(curl_exec($ch), true);

if (empty($response['allowed'])) {
  http_response_code(403);
  echo 'Ad visibility not confirmed';
  exit;
}

echo '<article>Protected content...</article>';
```
