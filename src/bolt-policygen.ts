// bolt-policygen.ts — drop into bolt.new and run
//
// What this does:
// - Parses the YAML config embedded below (subset YAML parser).
// - Generates idempotent SQL to enable/force RLS and create policies.
// - Triggers a download: policies.sql
//
// Notes:
// - Idempotent via pg_policies existence check per policy.
// - Roles supported: anon, authenticated (add/omit as you like).
// - No write policies defined => client writes are blocked by default.
// - Service role bypasses RLS (keep it server-side only).
//
// ------- Edit your YAML config here -------
const POLICY_YAML = String.raw`
version: 1
tables:
  - name: public.blogs
    enable_rls: true
    force_rls: true
    policies:
      - name: blogs_public_read_anon
        actions: [select]
        role: anon
        using: "true"
      - name: blogs_public_read_authenticated
        actions: [select]
        role: authenticated
        using: "true"

  - name: public.directus_files
    enable_rls: true
    force_rls: true
    policies:
      - name: files_public_read_anon
        actions: [select]
        role: anon
        using: "true"
      - name: files_public_read_authenticated
        actions: [select]
        role: authenticated
        using: "true"

  - name: storage.objects
    enable_rls: true
    force_rls: true
    policies:
      - name: pictures_bucket_read_anon
        actions: [select]
        role: anon
        using: "bucket_id = 'pictures'"
      - name: pictures_bucket_read_authenticated
        actions: [select]
        role: authenticated
        using: "bucket_id = 'pictures'"
`;
// ------- End YAML -------

// --- Types ---
type Action = "select" | "insert" | "update" | "delete";
type Role = "anon" | "authenticated" | string;

type Policy = {
  name: string;
  actions: Action[];
  role?: Role;
  using?: string;
  check?: string;
};

type TableCfg = {
  name: string; // schema.table or table
  enable_rls?: boolean;
  force_rls?: boolean;
  policies?: Policy[];
};

type PolicyCfg = {
  version?: number;
  tables: TableCfg[];
};

// --- Minimal YAML (subset) parser for the config shape above ---
function parseYamlSubset(yaml: string): PolicyCfg {
  // This is a very small, indentation-based parser that supports:
  // - key: value
  // - key: [a, b, c]
  // - nested arrays of objects introduced by "- "
  // - strings (quoted or unquoted) on one line
  // It is *not* a general YAML parser; keep to the provided shape.
  const lines = yaml
    .split(/\r?\n/)
    .map((l) => l.replace(/\t/g, "  ")) // normalize tabs -> 2 spaces
    .filter((l) => l.trim().length > 0 && !l.trim().startsWith("#"));

  type Node = any;
  const root: any = {};
  const stack: { indent: number; key: string | null; node: Node }[] = [
    { indent: -1, key: null, node: root },
  ];

  function current() {
    return stack[stack.length - 1];
  }
  function parent() {
    return stack[stack.length - 2];
  }
  function parseInlineArray(v: string): any[] {
    // [a, b, c]  or ["a", "b"]
    const inner = v.trim().slice(1, -1).trim();
    if (!inner) return [];
    // split by comma not inside quotes (simple)
    const parts = inner.split(",").map((s) => s.trim());
    return parts.map((p) => {
      if ((p.startsWith('"') && p.endsWith('"')) || (p.startsWith("'") && p.endsWith("'"))) {
        return p.slice(1, -1);
      }
      return p;
    });
  }

  for (const raw of lines) {
    const indent = raw.match(/^ */)![0].length;
    const line = raw.trim();

    // manage indent stack
    while (indent <= current().indent) stack.pop();

    // list item?
    if (line.startsWith("- ")) {
      const content = line.slice(2);
      const c = current();
      if (!Array.isArray(c.node)) {
        // convert current key into array if not already
        if (c.key && parent().node[c.key] === c.node) {
          parent().node[c.key] = [];
          stack.pop();
          stack.push({ indent: c.indent, key: c.key, node: parent().node[c.key] });
        } else {
          // if current node isn't an array, create anonymous array slot
          if (typeof c.node === "object") {
            // attempt to find last key that expects an array ('tables' or 'policies')
          }
        }
      }
      const arr = current().node as any[];
      // item can be "key: value" on same line, or start of object
      if (content.includes(":")) {
        const [k, vRaw] = content.split(/:(.*)/).slice(0, 2).map((s) => s.trim());
        const obj: any = {};
        if (vRaw.length) {
          let v = vRaw;
          // remove quotes if present
          if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
            v = v.slice(1, -1);
          }
          // inline array?
          if (v.startsWith("[") && v.endsWith("]")) {
            obj[k] = parseInlineArray(v);
          } else if (v === "true" || v === "false") {
            obj[k] = v === "true";
          } else if (/^\d+$/.test(v)) {
            obj[k] = Number(v);
          } else {
            obj[k] = v;
          }
        } else {
          obj[k] = null;
        }
        arr.push(obj);
        // push new object context for more keys
        stack.push({ indent, key: null, node: obj });
      } else {
        // plain object item
        const obj: any = {};
        arr.push(obj);
        stack.push({ indent, key: null, node: obj });
      }
      continue;
    }

    // key: value lines
    const kv = line.split(/:(.*)/);
    if (kv.length >= 2) {
      const key = kv[0].trim();
      let v = (kv[1] ?? "").trim();
      const holder = current().node;
      let value: any = null;
      if (!v.length) {
        // nested object or list to follow
        // create placeholder (object) by default
        value = {};
      } else if (v.startsWith("[") && v.endsWith("]")) {
        value = parseInlineArray(v);
      } else if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        value = v.slice(1, -1);
      } else if (v === "true" || v === "false") {
        value = v === "true";
      } else if (/^\d+$/.test(v)) {
        value = Number(v);
      } else {
        value = v;
      }

      // assign
      if (Array.isArray(holder)) {
        // shouldn't happen for a "key:" line unless we intended a mapping within last object
        // attempt to push into last object
        const last = holder[holder.length - 1];
        if (last && typeof last === "object" && !Array.isArray(last)) {
          last[key] = value;
          if (typeof value === "object" && !Array.isArray(value)) {
            stack.push({ indent, key, node: value });
          } else if (Array.isArray(value)) {
            stack.push({ indent, key, node: value });
          }
        }
      } else {
        holder[key] = value;
        if (typeof value === "object" && !Array.isArray(value)) {
          stack.push({ indent, key, node: value });
        } else if (Array.isArray(value)) {
          stack.push({ indent, key, node: value });
        }
      }
    }
  }

  return root as PolicyCfg;
}

// --- SQL generation ---
function qIdent(id: string) {
  // quote schema.table or table
  return id.split(".").map((p) => `"${p.replace(/"/g, '""')}"`).join(".");
}
function splitSchemaTable(id: string): { schema: string; table: string } {
  const parts = id.split(".");
  return parts.length === 2
    ? { schema: parts[0], table: parts[1] }
    : { schema: "public", table: parts[0] };
}
function makeCreatePolicySQL(tblName: string, p: Policy, action: Action) {
  const roleClause = p.role ? ` TO ${p.role}` : "";
  const using = p.using ? ` USING (${p.using})` : "";
  const check = p.check ? ` WITH CHECK (${p.check})` : "";
  const { schema, table } = splitSchemaTable(tblName);
  return `
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = '${schema}'
      AND tablename = '${table}'
      AND policyname = '${p.name}'
  ) THEN
    CREATE POLICY "${p.name}" ON ${qIdent(tblName)} FOR ${action}${roleClause}${using}${check};
  END IF;
END$$;`.trim();
}

function generateSQL(cfg: PolicyCfg) {
  const out: string[] = [];
  out.push("-- Generated by bolt-policygen.ts");
  out.push("BEGIN;");
  for (const t of cfg.tables || []) {
    if (t.enable_rls) {
      out.push(`ALTER TABLE ${qIdent(t.name)} ENABLE ROW LEVEL SECURITY;`);
    }
    if (t.force_rls) {
      out.push(`ALTER TABLE ${qIdent(t.name)} FORCE ROW LEVEL SECURITY;`);
    }
    for (const p of t.policies || []) {
      for (const action of p.actions) {
        out.push(makeCreatePolicySQL(t.name, p, action));
      }
    }
  }
  out.push("COMMIT;");
  return out.join("\n");
}

// --- Run: parse -> generate -> download ---
(function run() {
  try {
    const cfg = parseYamlSubset(POLICY_YAML);
    if (!cfg.tables || !Array.isArray(cfg.tables) || cfg.tables.length === 0) {
      throw new Error("No tables found in YAML (expected 'tables:').");
    }
    const sql = generateSQL(cfg);
    console.log(sql);

    // trigger download
    const blob = new Blob([sql], { type: "text/sql;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "policies.sql";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    console.info("✅ policies.sql generated and download started.");
  } catch (err: any) {
    console.error("❌ Failed to generate SQL:", err?.message || err);
  }
})();
