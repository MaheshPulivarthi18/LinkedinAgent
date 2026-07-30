import { readFileSync } from "node:fs";
import { loadToken, LINKEDIN_VERSION } from "./config.js";

const REST = "https://api.linkedin.com/rest";

function headers(extra: Record<string, string> = {}) {
  const t = loadToken();
  return {
    Authorization: `Bearer ${t.access_token}`,
    "LinkedIn-Version": LINKEDIN_VERSION,
    "X-Restli-Protocol-Version": "2.0.0",
    ...extra,
  };
}

/** Publish a plain text post to your own feed. Returns the new post URN. */
export async function createTextPost(
  commentary: string,
  visibility: "PUBLIC" | "CONNECTIONS" = "PUBLIC"
): Promise<string> {
  const t = loadToken();
  const payload = {
    author: t.person_urn,
    commentary,
    visibility,
    distribution: {
      feedDistribution: "MAIN_FEED",
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  };
  const res = await fetch(`${REST}/posts`, {
    method: "POST",
    headers: headers({ "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`createTextPost failed: ${await res.text()}`);
  // LinkedIn returns the new URN in the x-restli-id header.
  return res.headers.get("x-restli-id") ?? "(post created)";
}

/** Upload a local image file, return its urn:li:image:XXXX. */
export async function uploadImage(filePath: string): Promise<string> {
  const t = loadToken();
  // Step 1: initialize the upload — get an uploadUrl + image URN.
  const initRes = await fetch(`${REST}/images?action=initializeUpload`, {
    method: "POST",
    headers: headers({ "Content-Type": "application/json" }),
    body: JSON.stringify({ initializeUploadRequest: { owner: t.person_urn } }),
  });
  if (!initRes.ok)
    throw new Error(`image init failed: ${await initRes.text()}`);
  const init = (await initRes.json()) as {
    value: { uploadUrl: string; image: string };
  };

  // Step 2: PUT the raw bytes to the uploadUrl.
  const bytes = readFileSync(filePath);
  const putRes = await fetch(init.value.uploadUrl, {
    method: "PUT",
    headers: { Authorization: `Bearer ${t.access_token}` },
    body: bytes,
  });
  if (!putRes.ok)
    throw new Error(`image upload failed: ${await putRes.text()}`);

  return init.value.image;
}

/** Publish a post with a single image. */
export async function createImagePost(
  commentary: string,
  imagePath: string,
  altText = ""
): Promise<string> {
  const t = loadToken();
  const imageUrn = await uploadImage(imagePath);
  const payload = {
    author: t.person_urn,
    commentary,
    visibility: "PUBLIC",
    distribution: {
      feedDistribution: "MAIN_FEED",
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    content: { media: { id: imageUrn, altText } },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  };
  const res = await fetch(`${REST}/posts`, {
    method: "POST",
    headers: headers({ "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`createImagePost failed: ${await res.text()}`);
  return res.headers.get("x-restli-id") ?? "(image post created)";
}

/** Upload a PDF as a document (this is what becomes a "carousel"). */
export async function uploadDocument(filePath: string): Promise<string> {
  const t = loadToken();
  const initRes = await fetch(`${REST}/documents?action=initializeUpload`, {
    method: "POST",
    headers: headers({ "Content-Type": "application/json" }),
    body: JSON.stringify({ initializeUploadRequest: { owner: t.person_urn } }),
  });
  if (!initRes.ok)
    throw new Error(`document init failed: ${await initRes.text()}`);
  const init = (await initRes.json()) as {
    value: { uploadUrl: string; document: string };
  };
  const bytes = readFileSync(filePath);
  const putRes = await fetch(init.value.uploadUrl, {
    method: "PUT",
    headers: { Authorization: `Bearer ${t.access_token}` },
    body: bytes,
  });
  if (!putRes.ok)
    throw new Error(`document upload failed: ${await putRes.text()}`);
  return init.value.document;
}

/** Publish a document/carousel post from a local PDF. */
export async function createDocumentPost(
  commentary: string,
  pdfPath: string,
  title: string
): Promise<string> {
  const t = loadToken();
  const docUrn = await uploadDocument(pdfPath);
  const payload = {
    author: t.person_urn,
    commentary,
    visibility: "PUBLIC",
    distribution: {
      feedDistribution: "MAIN_FEED",
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    content: { media: { id: docUrn, title } },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  };
  const res = await fetch(`${REST}/posts`, {
    method: "POST",
    headers: headers({ "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  if (!res.ok)
    throw new Error(`createDocumentPost failed: ${await res.text()}`);
  return res.headers.get("x-restli-id") ?? "(document post created)";
}

/** Who am I — pulled from the stored token. */
export function whoAmI(): { person_urn: string; name?: string } {
  const t = loadToken();
  return { person_urn: t.person_urn, name: t.name };
}
