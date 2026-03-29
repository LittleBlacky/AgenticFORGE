export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // -------------------------------------------------------------------------
    // type 规范
    // -------------------------------------------------------------------------
    'type-enum': [
      2,
      'always',
      [
        'feat',     // 新功能
        'fix',      // Bug 修复
        'docs',     // 文档变更
        'style',    // 代码格式（不影响功能，如空格、分号等）
        'refactor', // 重构（不是新功能也不是 bug 修复）
        'perf',     // 性能优化
        'test',     // 测试用例（新增或修改）
        'chore',    // 构建/工程化/依赖管理/脚手架
        'revert',   // 回滚提交
        'ci',       // CI/CD 配置变更
        'build',    // 构建系统变更（rollup、tsconfig 等）
        'release',  // 版本发布
      ],
    ],
    'type-case': [2, 'always', 'lower-case'],
    'type-empty': [2, 'never'],

    // -------------------------------------------------------------------------
    // scope 规范
    // 对应 monorepo 各包、app 及工程横切关注点
    // 格式示例：
    //   feat(core): 新增 LLMClient streamThink 方法
    //   fix(tools): 修复 ToolRegistry.execute 参数校验
    //   chore(deps): 升级 zod 到 4.x
    //   docs(agents): 更新 ReActAgent 使用文档
    //   ci: 更新 GitHub Actions 配置（无 scope 也可）
    // -------------------------------------------------------------------------
    'scope-enum': [
      2,
      'always',
      [
        // --- 核心包 ---
        'core',          // @agenticforge/core (LLMClient, Agent 基类, Hooks)
        'tools',         // @agenticforge/tools (Tool, ToolRegistry, ToolChain)
        'tools-builtin', // @agenticforge/tools-builtin (SearchTool, NoteTool 等)
        'agents',        // @agenticforge/agents (FunctionCallAgent, ReActAgent 等)
        'skills',        // @agenticforge/skills (AgentSkill, SkillRunner, SkillLoader)
        'memory',        // @agenticforge/memory (WorkingMemory, SemanticMemory 等)
        'context',       // @agenticforge/context (ContextBuilder)
        'protocols',     // @agenticforge/protocols (A2AServer, MCPServer 等)
        'workflow',      // @agenticforge/workflow (WorkflowAgent, DAG)
        'utils',         // @agenticforge/utils (公共工具函数)
        'kit',           // @agenticforge/kit (all-in-one 导出包)

        // --- 应用 ---
        'second-brain',  // apps/second-brain (第二大脑应用)

        // --- 工程横切 ---
        'deps',          // 依赖升级 / pnpm-lock 变更
        'config',        // 根目录配置文件 (eslint, prettier, tsconfig 等)
        'ci',            // CI/CD 配置 (.github/workflows 等)
        'husky',         // Git hooks 配置
        'test',          // 测试基础设施 (vitest.config, 测试工具)
        'scripts',       // scripts/ 目录下的构建/发布脚本
        'release',       // 版本号 / CHANGELOG / tag
        'docs',          // docs/ 目录下的设计/架构文档
        'examples',      // examples/ 目录下的示例代码
      ],
    ],
    // scope 如果写了必须小写，用连字符分隔
    'scope-case': [2, 'always', 'lower-case'],
    // scope 不强制必填（工程类提交可以不写 scope）
    'scope-empty': [0],

    // -------------------------------------------------------------------------
    // subject 规范
    // -------------------------------------------------------------------------
    'subject-empty': [2, 'never'],
    'subject-full-stop': [2, 'never', '.'],
    'subject-max-length': [2, 'always', 100],

    // -------------------------------------------------------------------------
    // header / body / footer 长度
    // -------------------------------------------------------------------------
    'header-max-length': [2, 'always', 120],
    // body 和 footer 允许较长行（支持中文详细描述）
    'body-max-line-length': [1, 'always', 200],
    'footer-max-line-length': [1, 'always', 200],
  },

  // 支持中文 subject，兼容带 scope 和不带 scope 两种格式
  parserPreset: {
    parserOpts: {
      headerPattern: /^(\w+)(?:\(([\w\-\.@\/]+)\))?!?:\s(.+)$/,
      headerCorrespondence: ['type', 'scope', 'subject'],
    },
  },
};
