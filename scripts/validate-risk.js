const fs = require('fs');
const src = fs.readFileSync('/opt/mcp-servers/whm-cpanel/src/mcp-handler.js','utf8');
const targets = ['delete_domain','restart_service','restart_system_service','enable_dnssec_nsec3','disable_dnssec_nsec3','create_addon_conversion','update_userdomains_cache'];
const re = /name:\s*'(whm_cpanel_\w+)',\s*\n\s*description:\s*'([^']+)'/g;
let m;
while((m=re.exec(src))!==null){
  if(targets.some(t=>m[1].endsWith(t))){
    const len=m[2].length;
    const hasRisk = /destrutiva|irreversivel|indisponibilidade|Altera resolucao|Reduz seguranca|Pode afetar|Alteracao irreversivel/i.test(m[2]);
    const inRange = len>=250 && len<=350;
    const ok = inRange && hasRisk;
    console.log(`${ok?'PASS':'FAIL'} ${m[1]} (${len} chars, range=${inRange}, risk=${hasRisk})`);
  }
}
