import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

// The built contact page (website/public/contact.html) must let the form send
// without JavaScript, and must not post an empty submit. `npm test` runs in os/.
const html = readFileSync(path.resolve(process.cwd(), "../website/public/contact.html"), "utf8");
const formTag = html.match(/<form[^>]*data-enquiry[^>]*>/)?.[0] ?? "";
const noscript = html.match(/<noscript>([\s\S]*?)<\/noscript>/)?.[1] ?? "";

test("contact form posts to Web3Forms when a key is set", () => {
  assert.ok(formTag, "form found");
  assert.match(formTag, /action="https:\/\/api\.web3forms\.com\/submit"/);
  assert.match(formTag, /method="post"/);
});

test("contact form does not switch off browser validation (empty no-JS submit posts nothing)", () => {
  assert.doesNotMatch(formTag, /novalidate/i);
  assert.match(html, /<textarea[^>]*name="problem"[^>]*\brequired\b|<textarea[^>]*\brequired\b[^>]*name="problem"/);
  assert.match(html, /minlength="20"/);
  assert.match(html, /<input[^>]*name="contactName"[^>]*\brequired\b|<input[^>]*\brequired\b[^>]*name="contactName"/);
  assert.match(html, /<input[^>]*type="email"[^>]*\brequired\b|<input[^>]*\brequired\b[^>]*type="email"/);
});

test("no-JS-only fields sit inside noscript with the key from the form", () => {
  const key = formTag.match(/data-access-key="([^"]+)"/)?.[1];
  assert.ok(key, "access key on form");
  assert.ok(noscript.includes(`name="access_key" value="${key}"`));
  assert.match(noscript, /name="subject"/);
  assert.match(noscript, /name="from_name"/);
  assert.match(noscript, /type="checkbox" name="botcheck"/);
  const outside = html.replace(/<noscript>[\s\S]*?<\/noscript>/g, "");
  assert.doesNotMatch(outside, /name="access_key"/);
  assert.doesNotMatch(outside, /name="botcheck"/);
});
