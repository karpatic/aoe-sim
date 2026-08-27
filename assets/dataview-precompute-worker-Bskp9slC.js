const e=[`game.json`,`schemas.json`,`lifetimes.json`,`economy.json`,`resource_estimates.json`],t={maxRecordingBytes:134217728,maxMapDimensionTiles:1024,maxMapTiles:1048576,maxOperations:2e6,maxNormalizedActions:25e4,maxChatMessages:100,maxChatRawTextChars:2e3,maxChatDecodedTextChars:500,maxChatMetadataFields:16,maxCommandParameterFields:16,maxCommandParameterStringChars:120,maxReplayIdArrayLength:512,maxCanonicalJsonBytes:134217728,maxDataviewGeneratedJsonBytes:100663296,maxDataviewGeneratedJsonTotalBytes:201326592};`${a(t.maxRecordingBytes)}`,`${t.maxMapDimensionTiles}`,`${o(t.maxMapTiles)}`,`${o(t.maxOperations)}`,`${o(t.maxNormalizedActions)}`,`${o(t.maxChatMessages)}`,`${a(t.maxCanonicalJsonBytes)}`;function n(e,n=`Selected recording`){if(!Number.isSafeInteger(e)||e<0)throw Error(`${n} size must be a safe nonnegative integer byte count; received ${e}.`);if(e>t.maxRecordingBytes)throw Error(`${n} is ${a(e)}, above the local parser limit of ${a(t.maxRecordingBytes)}.`)}function r(e,n=`Generated dataview JSON`){if(!Number.isSafeInteger(e)||e<0)throw Error(`${n} byte length must be a safe nonnegative integer; received ${e}.`);if(e>t.maxDataviewGeneratedJsonBytes)throw Error(`${n} is ${a(e)}, above the standalone dataview per-file limit of ${a(t.maxDataviewGeneratedJsonBytes)}.`)}function i(e){if(!Number.isSafeInteger(e)||e<0)throw Error(`Generated dataview JSON total must be a safe nonnegative integer; received ${e}.`);if(e>t.maxDataviewGeneratedJsonTotalBytes)throw Error(`Generated dataview JSON total is ${a(e)}, above the standalone dataview limit of ${a(t.maxDataviewGeneratedJsonTotalBytes)}.`)}function a(e){return e<1024?`${e} B`:e<1048576?`${(e/1024).toFixed(1)} KiB`:`${(e/1024/1024).toFixed(2)} MiB`}function o(e){return String(e).replace(/\B(?=(\d{3})+(?!\d))/g,`,`)}const s=self,c=`/work`,l=`${c}/selected.aoe2record`,u=`${c}/aoe2techtree-data.json`,d={"game.json":`${c}/game.json`,"schemas.json":`${c}/schemas.json`,"lifetimes.json":`${c}/lifetimes.json`,"economy.json":`${c}/economy.json`,"resource_estimates.json":`${c}/resource_estimates.json`},f=[{path:`pyodide/pyodide.mjs`,sha256:`635a6da3218fe4e5668da595acfe8b5ce77453d597d602f19a423dd250653441`,maxBytes:131072},{path:`pyodide/pyodide.asm.js`,sha256:`b22e5831eade9ff10e6fe2c811c68688cd91f10154377b4f80debcf5bafa1e56`,maxBytes:2097152},{path:`pyodide/pyodide.asm.wasm`,sha256:`5effb6a1a6cc4a1a85bec4622701aa797c031e1de923cbbaf2ad47abdc4ab325`,maxBytes:10485760},{path:`pyodide/python_stdlib.zip`,sha256:`71fee17f88a6260ec8c9c7c063533ee59c021fdc88a1ce76247378d3c4a35f4c`,maxBytes:4194304},{path:`pyodide/pyodide-lock.json`,sha256:`f6e6f42f451f42affbbcddb00e8c9a3278dcbf399f57aab9f3f568839a7ff4a6`,maxBytes:262144},{path:`pyodide/libopenssl-1.1.1w.zip`,sha256:`48965994b6ace00d3ebbc2dc1b65c11978582620f4ef6c71a50d9ea4c5fc7437`,maxBytes:2097152},{path:`pyodide/hashlib-1.0.0-cp313-cp313-pyodide_2025_0_wasm32.whl`,sha256:`b5c736c84ce26cba4e5096c6b9d173a357666af5993cc08395bfb8bac997bb98`,maxBytes:131072}];s.onmessage=e=>{p(e.data).catch(t=>{let n={type:`error`,requestId:e.data.requestId,message:t instanceof Error?t.message:String(t)};s.postMessage(n)})};async function p(t){if(t.type!==`aoe-sim.dataview.precompute-request.v1`)throw Error(`Unknown dataview worker request.`);if(!crypto?.subtle)throw Error(`This browser worker does not expose Web Crypto hashing.`);let r=[];await C(r,`validating`,`Validating selected recording`,1,15,async()=>{if(m(t),n(t.sizeBytes,t.fileName||`Selected recording`),n(t.buffer.byteLength,`Selected recording buffer`),t.sizeBytes!==t.buffer.byteLength)throw Error(`Selected recording size changed before preprocessing: file metadata says ${t.sizeBytes} bytes, transferred buffer has ${t.buffer.byteLength} bytes.`)},t.requestId);let o=await C(r,`hashing`,`Hashing selected recording`,2,15,async()=>E(t.buffer),t.requestId),c=O(t.runtimeBaseUrl);await C(r,`verifying-runtime`,`Verifying pinned Pyodide runtime files`,3,15,async()=>{for(let e of f)await T(c,e.path,e.sha256,e.maxBytes)},t.requestId);let p=await C(r,`loading-pyodide`,`Loading Pyodide 0.28.3`,4,15,async()=>S(c),t.requestId);await C(r,`loading-python-packages`,`Loading hashlib and libopenssl`,5,15,async()=>{await p.loadPackage([`libopenssl`,`hashlib`])},t.requestId),h(p,await C(r,`loading-pipeline`,`Loading pinned replay pipeline`,6,15,async()=>T(c,`aoc-mgz-pipeline.zip`,`bab3345c2f8128350ce64090c73eb1088cc229af94a0add698be046233a26ffc`,524288),t.requestId),await T(c,`aoe2techtree-data.json`,`4e2f85b39e39078cdee71bdbaf2c36a8f0b50202de4032df7ba8e2c36c6049c4`,2097152),t.buffer),await g(p);let x=k(t.fileName),D=[{stage:`extracting-replay`,message:`Extracting replay with pinned aoc-mgz`,script:`extract_replay.py`,args:[l,`--output`,d[`game.json`]],sanitizer:`__dataview_sanitize_game(${A(d[`game.json`])}, ${A(x)}, ${A(o)}, ${t.sizeBytes})`},{stage:`generating-schemas`,message:`Generating recording schemas`,script:`generate_recording_schemas.py`,args:[d[`game.json`],`--output`,d[`schemas.json`]]},{stage:`inferring-lifetimes`,message:`Inferring object lifetimes`,script:`infer_lifetimes.py`,args:[d[`game.json`],`--output`,d[`lifetimes.json`]]},{stage:`generating-economy`,message:`Generating economy index`,script:`generate_economy.py`,args:[d[`game.json`],`--output`,d[`economy.json`],`--reference`,u],sanitizer:`__dataview_sanitize_economy(${A(d[`economy.json`])})`},{stage:`reconstructing-resources`,message:`Reconstructing resource estimates`,script:`reconstruct_resources.py`,args:[`--game`,d[`game.json`],`--lifetimes`,d[`lifetimes.json`],`--economy`,d[`economy.json`],`--reference`,u,`--output`,d[`resource_estimates.json`]],sanitizer:`__dataview_sanitize_resource_estimates(${A(d[`resource_estimates.json`])})`}],j=6;for(let e of D)j+=1,await C(r,e.stage,e.message,j,15,async()=>{await _(p,e.script,e.args),e.sanitizer&&await p.runPythonAsync(e.sanitizer),await p.runPythonAsync(`__dataview_assert_clean_json(${A(v(e))})`)},t.requestId);let M=[];for(let t of e)M.push(await y(p,t,d[t]));let N=`Unit stats are not available for this replay; base/effective unit stat tiles stay in fallback mode.`;if(o===`67accb2d81fc58f65bfe9696fb783374731b494ca102d78c7f5221c002d628bc`){let e=await C(r,`loading-known-unit-stats`,`Loading known replay unit stats`,12,15,async()=>T(c,`known/unit_stats-67accb2d81fc58f65bfe9696fb783374731b494ca102d78c7f5221c002d628bc.json`,`ee48a140aa1d6012e411268c82922b2ed7e6fb27cb1547e39a22a24f1c3fb9f5`,2097152),t.requestId);M.push(await b(`unit_stats.json`,e,`known-replay-unit-stats`)),N=`Known-replay unit stats loaded for the exact representative replay hash.`}let P=M.reduce((e,t)=>e+t.sizeBytes,0);i(P),w(t.requestId,`transferring`,`Transferring ${a(P)} of generated JSON`,14,15);let F={type:`done`,requestId:t.requestId,replay:{fileName:x,sizeBytes:t.sizeBytes,sha256:o},outputs:M,timings:r,unitStatsNotice:N};w(t.requestId,`done`,`Standalone dataview data is ready`,15,15),s.postMessage(F,M.map(e=>e.buffer)),s.close()}function m(e){if(!e.fileName||e.fileName!==k(e.fileName))throw Error(`Selected replay filename must be a basename, not a path.`);if(!e.fileName.toLowerCase().endsWith(`.aoe2record`))throw Error(`Selected file must use the .aoe2record extension.`);if(!Number.isSafeInteger(e.sizeBytes)||e.sizeBytes<=0)throw Error(`Selected recording must have a positive safe integer byte size.`);if(!Number.isFinite(e.lastModified)||e.lastModified<0)throw Error(`Selected recording has invalid file metadata.`)}function h(e,t,n,r){try{e.FS.mkdir(c)}catch{}e.unpackArchive(new Uint8Array(t),`zip`),e.FS.writeFile(l,new Uint8Array(r)),e.FS.writeFile(u,new Uint8Array(n))}async function g(e){await e.runPythonAsync(String.raw`
import contextlib
import io
import json
import os
import re
import runpy
import sys
import time
from pathlib import Path

WORK_DIR = Path("/work")
PIPELINE_DIR = Path.cwd() / "pipeline"
LOCAL_HOME_PATTERN = "/" + "home" + "/" + "carlos"
LOCAL_TEMP_PATTERN = "/" + "tmp"
FILE_URL_PATTERN = "file" + "://"
URL_AUTHORITY_PATTERN = ":" + "/" + "/"
URL_CREDENTIAL_PATTERN = re.escape(URL_AUTHORITY_PATTERN) + r"[^/\s:@]+:[^/\s@]+@"
FORBIDDEN_PATTERNS = [
    re.compile(re.escape(LOCAL_HOME_PATTERN)),
    re.compile(re.escape(LOCAL_TEMP_PATTERN) + r"(?:/|\b)"),
    re.compile(r"/work(?:/|\b)"),
    re.compile(re.escape(FILE_URL_PATTERN)),
    re.compile(r"[A-Za-z]:\\"),
    re.compile(URL_CREDENTIAL_PATTERN),
]

def __dataview_run_stage(name, args):
    script = PIPELINE_DIR / name
    if not script.is_file():
        raise FileNotFoundError(f"pipeline script missing: {name}")
    old_argv = sys.argv
    stdout = io.StringIO()
    stderr = io.StringIO()
    started = time.time()
    try:
        sys.argv = [name, *list(args)]
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            runpy.run_path(str(script), run_name="__main__")
    except BaseException as exc:
        return json.dumps({
            "ok": False,
            "name": name,
            "error": f"{type(exc).__name__}: {exc}",
            "stdout_tail": stdout.getvalue()[-4000:],
            "stderr_tail": stderr.getvalue()[-4000:],
            "elapsed": round(time.time() - started, 3),
        })
    finally:
        sys.argv = old_argv
    return json.dumps({
        "ok": True,
        "name": name,
        "stdout_tail": stdout.getvalue()[-1200:],
        "stderr_tail": stderr.getvalue()[-1200:],
        "elapsed": round(time.time() - started, 3),
    })

def __dataview_write_json(path, data):
    Path(path).write_text(json.dumps(data, indent=2, ensure_ascii=False, separators=(",", ": ")) + "\n", encoding="utf-8")

def __dataview_sanitize_game(path, basename, replay_sha256, size_bytes):
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    data["source_recording"] = {
        "filename": basename,
        "path": f"browser-local:{basename}",
        "original_source": None,
        "size_bytes": size_bytes,
        "modified_utc": None,
        "sha256": replay_sha256,
        "local_only": True,
    }
    __dataview_write_json(path, data)

def __dataview_sanitize_economy(path):
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    source = data.setdefault("source", {})
    source["game_json"] = "browser-generated:game.json"
    source["reference_loaded_from"] = "pinned-public:aoe2techtree-data.json"
    __dataview_write_json(path, data)

def __dataview_sanitize_resource_estimates(path):
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    source = data.setdefault("source", {})
    source["game_json"] = "browser-generated:game.json"
    source["lifetimes_json"] = "browser-generated:lifetimes.json"
    source["economy_json"] = "browser-generated:economy.json"
    source["reference_json"] = "pinned-public:aoe2techtree-data.json"
    __dataview_write_json(path, data)

def __dataview_assert_clean_json(path):
    text = Path(path).read_text(encoding="utf-8")
    for pattern in FORBIDDEN_PATTERNS:
        if pattern.search(text):
            raise ValueError(f"generated dataview JSON contains forbidden local path or credential pattern: {pattern.pattern}")
    json.loads(text)
`)}async function _(e,t,n){let r=String(await e.runPythonAsync(`__dataview_run_stage(${A(t)}, ${j(n)})`)),i=JSON.parse(r);if(!i.ok){let e=[i.error,i.stderr_tail,i.stdout_tail].filter(Boolean).join(`
`);throw Error(`Pipeline stage ${t} failed: ${e}`)}}function v(e){switch(e.stage){case`extracting-replay`:return d[`game.json`];case`generating-schemas`:return d[`schemas.json`];case`inferring-lifetimes`:return d[`lifetimes.json`];case`generating-economy`:return d[`economy.json`];case`reconstructing-resources`:return d[`resource_estimates.json`];default:return d[`game.json`]}}async function y(e,t,n){return b(t,D(e.FS.readFile(n)),`pyodide-pipeline`)}async function b(e,t,n){return r(t.byteLength,e),x(t,e),{name:e,sizeBytes:t.byteLength,sha256:await E(t),source:n,buffer:t}}function x(e,t){let n=new TextDecoder(`utf-8`,{fatal:!0}).decode(e),r=e=>e.replace(/[.*+?^${}()|[\]\\]/g,`\\$&`),i=new URL(location.href),a=i.pathname.slice(0,1),o=i.protocol.slice(-1),s=a+[`home`,`carlos`].join(a),c=a+`tmp`,l=[`file`,o,a,a].join(``),u=o+a+a,d=[new RegExp(r(s)),RegExp(`${r(c)}(?:/|\\b)`),/\/work(?:\/|\b)/,new RegExp(r(l)),/[A-Za-z]:\\/,RegExp(`${r(u)}[^\\s/:@]+:[^\\s/@]+@`)].find(e=>e.test(n));if(d)throw Error(`${t} contains a forbidden local path or credential pattern: ${d.source}`);JSON.parse(n)}async function S(e){let t=new URL(`pyodide/pyodide.mjs`,e);if(t.origin!==location.origin)throw Error(`Pyodide loader must be served from this origin.`);let n=await import(t.href);if(n.version!==`0.28.3`)throw Error(`Unexpected Pyodide loader version: ${n.version}.`);return n.loadPyodide({indexURL:new URL(`pyodide/`,e).href,stdout:()=>void 0,stderr:()=>void 0})}async function C(e,t,n,r,i,a,o){w(o,t,n,Math.max(0,r-1),i);let s=performance.now(),c=await a();return e.push({stage:t,elapsedMs:Math.round(performance.now()-s)}),w(o,t,n,r,i),c}function w(e,t,n,r,i){s.postMessage({type:`progress`,requestId:e,stage:t,message:n,completed:r,total:i})}async function T(e,t,n,r){let i=new URL(t,e);if(i.origin!==location.origin)throw Error(`Runtime asset must be same-origin: ${t}`);i.searchParams.set(`sha256`,n);let o=await fetch(i.href,{cache:`force-cache`});if(!o.ok)throw Error(`${t}: HTTP ${o.status}`);let s=Number(o.headers.get(`content-length`)??0);if(s>r)throw Error(`${t} is ${a(s)}, above its runtime asset limit.`);let c=await o.arrayBuffer();if(c.byteLength>r)throw Error(`${t} is ${a(c.byteLength)}, above its runtime asset limit.`);let l=await E(c);if(l!==n)throw Error(`${t} hash mismatch: expected ${n}, got ${l}.`);return c}async function E(e){let t=await crypto.subtle.digest(`SHA-256`,e);return[...new Uint8Array(t)].map(e=>e.toString(16).padStart(2,`0`)).join(``)}function D(e){return e.byteOffset===0&&e.byteLength===e.buffer.byteLength?e.buffer:e.slice().buffer}function O(e){let t=new URL(e,location.href);if(t.origin!==location.origin)throw Error(`Dataview runtime assets must be served from this origin.`);return t.pathname.endsWith(`/`)||(t.pathname+=`/`),t.href}function k(e){return e.split(/[\\/]/).pop()?.replace(/[^\w .()[\]-]/g,`_`).slice(0,160)||`selected.aoe2record`}function A(e){return JSON.stringify(e)}function j(e){return JSON.stringify(e)}