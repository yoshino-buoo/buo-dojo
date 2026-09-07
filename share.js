import { CONFIG } from "./config.js";
import { isYoshinoRecord } from "./breath.js";
import { renderShareCard } from "./share-card.js";

export function shareText(result, href) {
  const url = new URL("./", href);
  url.search = "";
  url.hash = "";
  const seconds = (Math.floor(result.durationMs / 100) / 10).toFixed(1);
  return `🐚＼ 法螺貝、何秒吹ける？ ／🐚

依田芳乃ちゃんと「ぶおおー」してきましたー。

今回の記録は
【${result.glyphs.length}文字／${seconds}秒】！

そなたもスマホに、ふーっと。👇

${CONFIG.shareHashtags.map((tag) => `#${tag}`).join("\n")}

${url.href}`;
}

/** A result owns its artwork until replay; exports never upload data. */
export function createResultSharing() {
  const $ = document.getElementById.bind(document);
  let current = null;
  let revision = 0;
  let sharing = false;

  function note(message) {
    $("share-note").textContent = message;
  }

  function readyControls(native) {
    $("share-native").hidden = !native;
    $("share-web").classList.toggle("x-post-button", !native);
    $("share-web").textContent = "Xの投稿画面を開く";
    $("share-copy-image").hidden = !(
      globalThis.ClipboardItem && navigator.clipboard?.write
    );
    $("share-download").hidden = false;
    $("share-status").hidden = true;
    note(
      native
        ? "共有メニューで「X」を選んでください。"
        : "リンクには「武・謳・鶯・王」の画像が表示されます。本日の結果画像は、保存やコピーで添付できます。",
    );
  }

  function mobileFileSharing(file) {
    try {
      const touch =
        navigator.maxTouchPoints > 0 ||
        window.matchMedia?.("(pointer: coarse)").matches;
      return Boolean(
        touch && navigator.share && navigator.canShare?.({ files: [file] }),
      );
    } catch {
      return false;
    }
  }

  async function generate(target) {
    const token = ++revision;
    $("share-status").textContent = "シェア画像をつくっています…";
    $("share-status").hidden = false;
    $("share-retry").hidden = true;
    try {
      const blob = await renderShareCard(target.result, target.pose);
      if (token !== revision || current !== target) return;
      const file = new File(
        [blob],
        `buo-dojo-${Math.floor(target.result.durationMs)}ms-${target.result.glyphs.length}moji.png`,
        { type: "image/png" },
      );
      target.file = file;
      target.url = URL.createObjectURL(blob);
      target.native = mobileFileSharing(file);
      $("share-image").src = target.url;
      $("share-image").hidden = false;
      $("share-download").href = target.url;
      $("share-download").download = file.name;
      readyControls(target.native);
    } catch {
      if (token !== revision || current !== target) return;
      $("share-status").textContent =
        "画像をつくれませんでした。もう一度おためしください。";
      $("share-retry").hidden = false;
      note("投稿文だけでもXにシェアできます。");
    }
  }

  function prepare(result) {
    revision++;
    if (current?.url) URL.revokeObjectURL(current.url);
    current = {
      result: { ...result, glyphs: [...result.glyphs] },
      text: shareText(result, location.href),
      pose: Math.random() < 0.5 ? "A" : "B",
    };
    sharing = false;
    $("result-dialog").dataset.view = "result";
    $("result-dialog").setAttribute("aria-labelledby", "result-title");
    $("share-view").dataset.pose = current.pose;
    $("share-view").dataset.glyphs = result.glyphs.join("");
    $("share-image").hidden = true;
    $("share-image").removeAttribute("src");
    $("share-image").alt =
      `${result.glyphs.length}文字・${(Math.floor(result.durationMs / 100) / 10).toFixed(1)}秒。${result.glyphs.join("、")}。依田芳乃のシェアカード。${isYoshinoRecord(result.durationMs) ? "依田芳乃の記念印つき。" : ""}`;
    $("share-native").hidden = true;
    $("share-native").disabled = false;
    $("share-download").hidden = true;
    $("share-copy-image").hidden = true;
    $("share-fallback").hidden = true;
    const intent = new URL("https://x.com/intent/post");
    intent.searchParams.set("text", current.text);
    intent.searchParams.set("lang", "ja");
    $("share-web").href = intent.href;
    $("share-web").textContent = "Xの投稿画面を開く";
    $("share-web").classList.remove("x-post-button");
    note("");
    void generate(current);
  }

  function show() {
    if (!current) return;
    $("result-dialog").dataset.view = "share";
    $("result-dialog").setAttribute("aria-labelledby", "share-title");
    $("result-dialog").scrollTop = 0;
    $("share-title").focus({ preventScroll: true });
  }
  $("share-back").addEventListener("click", () => {
    $("result-dialog").dataset.view = "result";
    $("result-dialog").setAttribute("aria-labelledby", "result-title");
    $("result-dialog").scrollTop = 0;
    $("share-preview-button").focus({ preventScroll: true });
  });
  $("share-retry").addEventListener("click", () => {
    if (current) void generate(current);
  });
  async function shareNative() {
    const target = current;
    if (!target?.file || sharing) return;
    sharing = true;
    $("share-native").disabled = true;
    try {
      // Already-rendered File: call share synchronously in the tap activation.
      await navigator.share({ files: [target.file], text: target.text });
    } catch (error) {
      if (current === target && error?.name !== "AbortError") {
        target.native = false;
        readyControls(false);
        show();
        note(
          "画像を直接共有できませんでした。「Xの投稿画面を開く」からリンクつきでシェアできます。",
        );
      }
    } finally {
      if (current === target) {
        sharing = false;
        $("share-native").disabled = false;
      }
    }
  }
  function share() {
    if (!current || sharing) return;
    if (current.native) return shareNative();
    // X reads the public page's fixed card; no local PNG attachment is needed.
    window.open($("share-web").href, "_blank", "noopener,noreferrer");
  }
  $("share-native").addEventListener("click", shareNative);
  $("share-copy-image").addEventListener("click", async () => {
    const target = current;
    if (!target?.file) return;
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": target.file }),
      ]);
      if (current === target)
        note("画像をコピーしました。Xの投稿欄に貼り付けてください。");
    } catch {
      if (current === target)
        note("画像をコピーできませんでした。「画像を保存」をお使いください。");
    }
  });
  $("share-copy-text").addEventListener("click", async () => {
    const target = current;
    if (!target) return;
    try {
      await navigator.clipboard.writeText(target.text);
      if (current === target) note("投稿文をコピーしました。");
    } catch {
      if (current !== target) return;
      $("share-fallback").value = target.text;
      $("share-fallback").hidden = false;
      $("share-fallback").focus();
      $("share-fallback").select();
      note("投稿文を長押ししてコピーしてください。");
    }
  });
  return { prepare, show, share };
}
