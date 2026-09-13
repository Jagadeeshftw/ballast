// Forward only the settings the convenience process needs. In particular, never source
// the repository's deployer .env or inherit wallet keys into the worker process.
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { spawn } from "node:child_process";
const permitted=new Set(["migrate.ts","watcher.ts","probe.ts"]);
const script=process.argv[2];
if(!permitted.has(script))throw new Error("Unknown convenience command");
let url=process.env.DATABASE_URL;
if(!url){try{url=parseEnv(readFileSync(new URL("../.env.local",import.meta.url),"utf8")).DATABASE_URL;}catch{/* optional local configuration */}}
const child=spawn(process.execPath,["--import","tsx",new URL(script,import.meta.url).pathname,...process.argv.slice(3)],{
 cwd:new URL("../",import.meta.url),stdio:"inherit",env:{PATH:process.env.PATH??"",HOME:process.env.HOME??"",NODE_ENV:process.env.NODE_ENV??"production",...(url?{DATABASE_URL:url}:{})},
});
for(const signal of ["SIGTERM","SIGINT"])process.on(signal,()=>child.kill(signal));
child.on("exit",code=>{process.exitCode=code??1;});
