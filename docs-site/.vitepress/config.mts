import {defineConfig} from "vitepress";

const base = process.env.VITEPRESS_BASE ?? "/";

export default defineConfig({
  title: "AgenticFORGE",
  description: "A TypeScript Agent Framework Driven by Tool Invocation",
  base,

  head: [
    ["link", {rel: "icon", type: "image/x-icon", href: `${base}favicon.ico`}],
    ["link", {rel: "icon", type: "image/png", sizes: "32x32", href: `${base}logo.png`}],
    ["link", {rel: "shortcut icon", href: `${base}favicon.ico`}],
    ["link", {rel: "apple-touch-icon", href: `${base}logo.png`}],
    ["meta", {name: "theme-color", content: "#f97316"}],
  ],

  locales: {
    root: {
      label: "English",
      lang: "en-US",
      themeConfig: {
        nav: [
          {text: "Guide", link: "/guide/introduction"},
          {text: "Packages", link: "/packages/kit"},
          {
            text: "v1.5.0",
            items: [
              {text: "npm", link: "https://www.npmjs.com/package/@agenticforge/kit"},
              {text: "GitHub", link: "https://github.com/LittleBlacky/AgenticFORGE"},
              {text: "Changelog", link: "/changelog"},
            ],
          },
        ],
        sidebar: {
          "/guide/": [
            {
              text: "Getting Started",
              items: [
                {text: "Introduction", link: "/guide/introduction"},
                {text: "Quick Start", link: "/guide/quickstart"},
                {text: "Installation", link: "/guide/installation"},
              ],
            },
            {
              text: "Core Concepts",
              items: [
                {text: "Agents", link: "/guide/agents"},
                {text: "Tools", link: "/guide/tools"},
                {text: "Memory", link: "/guide/memory"},
                {text: "RAG Pipeline", link: "/guide/rag"},
                {text: "Context Builder", link: "/guide/context"},
                {text: "Skills", link: "/guide/skills"},
                {text: "Hooks", link: "/guide/hooks"},
              ],
            },
            {
              text: "Advanced",
              items: [
                {text: "Protocols", link: "/guide/protocols"},
              ],
            },
          ],
          "/packages/": [
            {
              text: "Packages",
              items: [
                {text: "@agenticforge/kit", link: "/packages/kit"},
                {text: "@agenticforge/core", link: "/packages/core"},
                {text: "@agenticforge/agents", link: "/packages/agents"},
                {text: "@agenticforge/workflow", link: "/packages/workflow"},
                {text: "@agenticforge/skills", link: "/packages/skills"},
                {text: "@agenticforge/memory", link: "/packages/memory"},
                {text: "@agenticforge/tools", link: "/packages/tools"},
                {text: "@agenticforge/tools-builtin", link: "/packages/tools-builtin"},
                {text: "@agenticforge/context", link: "/packages/context"},
                {text: "@agenticforge/utils", link: "/packages/utils"},
                {text: "@agenticforge/protocols", link: "/packages/protocols"},
              ],
            },
          ],
        },
      },
    },

    zh: {
      label: "\u4e2d\u6587",
      lang: "zh-CN",
      link: "/zh/",
      themeConfig: {
        nav: [
          {text: "\u6307\u5357", link: "/zh/guide/introduction"},
          {text: "\u5305\u6587\u6863", link: "/zh/packages/kit"},
          {
            text: "v1.5.0",
            items: [
              {text: "npm", link: "https://www.npmjs.com/package/@agenticforge/kit"},
              {text: "GitHub", link: "https://github.com/LittleBlacky/AgenticFORGE"},
            ],
          },
        ],
        sidebar: {
          "/zh/guide/": [
            {
              text: "\u5feb\u901f\u4e0a\u624b",
              items: [
                {text: "\u7b80\u4ecb", link: "/zh/guide/introduction"},
                {text: "\u5feb\u901f\u5f00\u59cb", link: "/zh/guide/quickstart"},
                {text: "\u5b89\u88c5", link: "/zh/guide/installation"},
              ],
            },
            {
              text: "\u6838\u5fc3\u6982\u5ff5",
              items: [
                {text: "Agent", link: "/zh/guide/agents"},
                {text: "\u5de5\u5177", link: "/zh/guide/tools"},
                {text: "\u8bb0\u5fc6\u7cfb\u7edf", link: "/zh/guide/memory"},
                {text: "RAG \u6d41\u6c34\u7ebf", link: "/zh/guide/rag"},
                {text: "\u4e0a\u4e0b\u6587\u6784\u5efa\u5668", link: "/zh/guide/context"},
                {text: "Skills \u6280\u80fd\u7cfb\u7edf", link: "/zh/guide/skills"},
                {text: "Hooks", link: "/zh/guide/hooks"},
              ],
            },
            {
              text: "\u8fdb\u9636",
              items: [
                {text: "\u534f\u8bae", link: "/zh/guide/protocols"},
              ],
            },
          ],
          "/zh/packages/": [
            {
              text: "\u5305\u6587\u6863",
              items: [
                {text: "@agenticforge/kit", link: "/zh/packages/kit"},
                {text: "@agenticforge/core", link: "/zh/packages/core"},
                {text: "@agenticforge/agents", link: "/zh/packages/agents"},
                {text: "@agenticforge/workflow", link: "/zh/packages/workflow"},
                {text: "@agenticforge/skills", link: "/zh/packages/skills"},
                {text: "@agenticforge/memory", link: "/zh/packages/memory"},
                {text: "@agenticforge/tools", link: "/zh/packages/tools"},
                {text: "@agenticforge/tools-builtin", link: "/zh/packages/tools-builtin"},
                {text: "@agenticforge/context", link: "/zh/packages/context"},
                {text: "@agenticforge/utils", link: "/zh/packages/utils"},
                {text: "@agenticforge/protocols", link: "/zh/packages/protocols"},
              ],
            },
          ],
        },
      },
    },
  },

  themeConfig: {
    logo: "/logo.png",
    siteTitle: "AgenticFORGE",

    socialLinks: [
      {icon: "github", link: "https://github.com/LittleBlacky/AgenticFORGE"},
    ],

    footer: {
      message: "Released under the CC BY-NC-SA 4.0 License.",
      copyright: "Copyright \u00a9 2026 LittleBlacky",
    },

    search: {
      provider: "local",
    },
  },
});
