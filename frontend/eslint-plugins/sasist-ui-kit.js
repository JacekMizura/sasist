/**
 * ESLint plugin: Sasist UI Kit enforcement.
 * Blocks magic Tailwind chrome and local UI token islands outside design-system.
 */

const MAGIC_CLASS_RE =
  /\b(?:rounded-(?:xl|lg|md)|shadow-(?:sm|lg)|h-(?:8|9|10)|bg-orange-\S+|text-orange-\S+)\b/;

const LOCAL_TOKEN_FILE_RE =
  /(?:UiTokens|ButtonTokens|MaterialsUi|OperationalUi|UiSkin|panelUiStatusSettingsStyles)\.(?:ts|tsx)$/i;

function collectStringLiterals(node, out) {
  if (!node) return;
  if (node.type === "Literal" && typeof node.value === "string") {
    out.push({ value: node.value, node });
    return;
  }
  if (node.type === "TemplateLiteral") {
    for (const q of node.quasis) {
      out.push({ value: q.value.cooked ?? q.value.raw ?? "", node: q });
    }
    return;
  }
  if (node.type === "BinaryExpression" && node.operator === "+") {
    collectStringLiterals(node.left, out);
    collectStringLiterals(node.right, out);
  }
}

function isDesignSystemFile(filename) {
  const normalized = filename.replace(/\\/g, "/");
  return normalized.includes("/design-system/");
}

function isAllowedLegacyFacade(filename) {
  const normalized = filename.replace(/\\/g, "/");
  // Existing facades may keep magic until migrated; new files matching token names are blocked.
  const knownFacades = [
    "/components/filters/filterUiTokens.ts",
    "/components/listPage/listSellasistTokens.ts",
    "/modules/carts/wmsOperationalUi.ts",
    "/modules/warehouseMaterials/warehouseMaterialsUi.ts",
    "/modules/purchasing/ui/purchasingButtonTokens.ts",
    "/components/settings/panelUiStatusSettingsStyles.ts",
    "/design-system/brandUi.ts",
    "/design-system/pageLayout.ts",
    "/design-system/warehouseChrome.ts",
  ];
  return knownFacades.some((p) => normalized.endsWith(p) || normalized.includes(p));
}

const noMagicTailwind = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow magic Tailwind radius/shadow/height/brand color classes outside design-system.",
    },
    schema: [],
    messages: {
      magic:
        "Magic Tailwind class \"{{cls}}\" is forbidden outside design-system. Use Sasist UI Kit components or tokens.",
    },
  },
  create(context) {
    const filename = context.filename || context.getFilename();
    if (isDesignSystemFile(filename)) return {};
    if (isAllowedLegacyFacade(filename)) return {};

    function check(node, value) {
      if (!value || typeof value !== "string") return;
      const m = value.match(MAGIC_CLASS_RE);
      if (m) {
        context.report({ node, messageId: "magic", data: { cls: m[0] } });
      }
    }

    return {
      Literal(node) {
        if (typeof node.value === "string") check(node, node.value);
      },
      TemplateElement(node) {
        check(node, node.value.cooked ?? node.value.raw ?? "");
      },
      JSXAttribute(node) {
        if (node.name?.name !== "className") return;
        if (!node.value) return;
        if (node.value.type === "Literal") check(node.value, node.value.value);
        if (node.value.type === "JSXExpressionContainer") {
          const parts = [];
          collectStringLiterals(node.value.expression, parts);
          for (const p of parts) check(p.node, p.value);
        }
      },
    };
  },
};

const noLocalUiTokenFile = {
  meta: {
    type: "problem",
    docs: {
      description: "Forbid new local UI token / button token island files outside design-system.",
    },
    schema: [],
    messages: {
      island:
        "Local UI token island \"{{file}}\" is forbidden. Put tokens/components in frontend/src/design-system.",
    },
  },
  create(context) {
    const filename = context.filename || context.getFilename();
    if (isDesignSystemFile(filename)) return {};
    if (isAllowedLegacyFacade(filename)) return {};
    const normalized = filename.replace(/\\/g, "/");
    const base = normalized.split("/").pop() || "";
    if (LOCAL_TOKEN_FILE_RE.test(base) || LOCAL_TOKEN_FILE_RE.test(normalized)) {
      return {
        Program(node) {
          context.report({ node, messageId: "island", data: { file: base } });
        },
      };
    }
    return {};
  },
};

const noDeprecatedFacadeImport = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Prefer design-system over deprecated UI facades.",
    },
    schema: [],
    messages: {
      facade:
        "Import from design-system instead of deprecated facade \"{{source}}\".",
    },
  },
  create(context) {
    const filename = context.filename || context.getFilename();
    if (isDesignSystemFile(filename)) return {};
    if (isAllowedLegacyFacade(filename)) return {};

    const banned = [
      "WarehouseCardButton",
      "filterUiTokens",
      "listSellasistTokens",
      "wmsOperationalUi",
      "warehouseMaterialsUi",
      "purchasingButtonTokens",
      "panelUiStatusSettingsStyles",
    ];

    return {
      ImportDeclaration(node) {
        const source = String(node.source.value || "");
        const hit = banned.find((b) => source.includes(b));
        if (hit) {
          context.report({ node, messageId: "facade", data: { source } });
        }
      },
    };
  },
};

export default {
  rules: {
    "no-magic-tailwind": noMagicTailwind,
    "no-local-ui-token-file": noLocalUiTokenFile,
    "no-deprecated-facade-import": noDeprecatedFacadeImport,
  },
};
