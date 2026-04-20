const CLIENT_ID =
  "565902326058-ce9j42bs2lgvqu9pr1i3jdd9ckptbite.apps.googleusercontent.com";
const SCOPE = "https://www.googleapis.com/auth/drive.file";

let cachedToken = null;
let tokenExpiry = 0;

function loadGIS() {
  return new Promise((resolve) => {
    if (window.google?.accounts) return resolve();
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.onload = resolve;
    document.head.appendChild(script);
  });
}

async function getToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;

  await loadGIS();

  return new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: (resp) => {
        if (resp.error) reject(new Error(resp.error));
        else {
          cachedToken = resp.access_token;
          tokenExpiry = Date.now() + (resp.expires_in ?? 3600) * 1000 - 60_000;
          resolve(cachedToken);
        }
      },
    });
    client.requestAccessToken({ prompt: "" });
  });
}

export async function uploadToDrive(buffer, fileName) {
  const token = await getToken();

  const metadata = {
    name: fileName,
    mimeType: "application/vnd.google-apps.spreadsheet",
  };

  const form = new FormData();
  form.append(
    "metadata",
    new Blob([JSON.stringify(metadata)], { type: "application/json" }),
  );
  form.append(
    "file",
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
  );

  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    },
  );

  if (!res.ok) throw new Error(`Drive API error: ${res.status}`);
  const data = await res.json();
  return data.webViewLink;
}
