export async function uploadToDrive(fileName: string, content: string, accessToken: string, apiKey: string) {
  const metadata = {
    name: fileName,
    mimeType: 'application/json',
  };

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', new Blob([content], { type: 'application/json' }));

  const response = await fetch(`https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
    body: form
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error?.message || "Erro desconhecido no upload");
  }

  return await response.json();
}