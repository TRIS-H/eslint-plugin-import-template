import fs from 'fs'
import path from 'path'
import type { Rule } from 'eslint'

// Visitor 与生命周期
// VAttribute(node)：当 ESLint 在普通遍历阶段遇到模板属性时，会触发此函数；函数检查属性名（src / href）并对静态字面量值调用 checkRaw。
// Program:exit()：在文件解析完成、所有常规模拟遍历结束后被调用；从 context.getSourceCode().ast.templateBody 取得 Vue 模板 AST 并调用 traverseTemplateBody 做一次完整遍历。错误捕捉并通过 console.error 输出异常，避免抛出中断 ESLint。

// 判断是否为 URL 或 Data URI
function isUrlOrData(v: string): boolean {
  return /^(https?:|data:|\/\/)/.test(v)
}

interface Options {
  aliases?: Record<string, string>
  extensions?: string[]
}

const plugin: { rules: Record<string, Rule.RuleModule> } = {
  rules: {
    'vue-template-no-unresolved': {
      meta: {
        type: 'problem', // 规则类型：问题类（会报错）
        docs: {
          description: '检查 Vue 模板中静态 `src`/`href` 引用的文件是否存在',
          category: 'Possible Errors' // 属于"可能的错误"分类
        },
        // 规则配置的 JSON Schema
        schema: [
          {
            type: 'object',
            properties: {
              aliases: {
                type: 'object',
                additionalProperties: { type: 'string' }
              },
              extensions: {
                type: 'array',
                items: { type: 'string' }
              }
            },
            // 不允许其他配置项
            additionalProperties: false
          }
        ]
      },
      //规则主体（Linter 调用时创建）
      create(context: Rule.RuleContext) {
        const options = (context.options && context.options[0]) || ({} as Options)
        const aliases: Record<string, string> = (options as Options).aliases || { '@/': './src/' }
        const extensions: string[] = (options as Options).extensions || [
          '.png',
          '.webp',
          '.jpg',
          '.jpeg',
          '.svg',
          '.gif',
          '.ico'
        ]

        // 路径解析函数
        function resolveWithAliases(raw: string, filename?: string): string | null {
          // 1. 忽略 URL 或 Data URI（外部资源）
          if (isUrlOrData(raw)) {
            return null
          }

          // 2. 尝试匹配配置的别名
          for (const a of Object.keys(aliases)) {
            if (raw.startsWith(a)) {
              const target = aliases[a]
              return path.resolve(process.cwd(), target, raw.slice(a.length))
            }
          }

          // 3. 相对路径（以 . 开头），相对于当前文件解析
          if (raw.startsWith('.')) {
            //当 ESLint 检查的代码不是来自实际文件时，context.getFilename() 会返回 <input>。
            if (!filename || filename === '<input>') {
              return null
            }
            return path.resolve(path.dirname(filename), raw)
          }

          // 4. 绝对路径（以 / 开头），相对于项目根目录
          if (raw.startsWith('/')) {
            return path.resolve(process.cwd(), `.${raw}`)
          }

          // 5. 其他情况（如 public/ 目录下的资源、外部包等），跳过检查
          return null
        }

        // 文件检查函数
        function checkRaw(raw: unknown, nodeForReport: any): void {
          if (!raw || typeof raw !== 'string') {
            return
          }
          const resolved = resolveWithAliases(raw as string, context.getFilename())
          if (!resolved) {
            return
          }
          // 获取文件扩展名
          const ext = path.extname(resolved)
          if (ext) {
            if (!fs.existsSync(resolved)) {
              context.report({ node: nodeForReport, message: `Asset not found: ${raw}` })
            }
          } else {
            // 无扩展名的情况：尝试添加各种扩展名
            let found = false
            for (const e of extensions) {
              if (fs.existsSync(resolved + e)) {
                found = true
                break
              }
            }
            // 如果所有扩展名都找不到文件，报错
            if (!found) {
              context.report({
                node: nodeForReport,
                message: `Asset not found (tried ${extensions.join(', ')}): ${raw}`
              })
            }
          }
        }

        // 模版遍历函数
        function traverseTemplateBody(templateBody: any): void {
          if (!templateBody || !templateBody.children) {
            return
          }
          // 使用栈进行深度优先遍历（替代递归，避免栈溢出）
          const stack = [...templateBody.children]
          while (stack.length) {
            const n = stack.shift() as any
            if (!n) {
              continue
            }
            // 如果是 VElement 节点（HTML元素），可能有静态属性
            if (n.type === 'VElement' && n.startTag && Array.isArray(n.startTag.attributes)) {
              for (const attr of n.startTag.attributes) {
                if (!attr) {
                  continue
                }
                // 只处理 VAttribute 类型（静态属性）
                if (attr.type === 'VAttribute') {
                  const name = attr.key && (attr.key.name as string)
                  // 只检查 src 和 href 属性
                  if (name === 'src' || name === 'href') {
                    // 确保属性值是静态字符串（VLiteral）
                    if (attr.value && attr.value.type === 'VLiteral') {
                      checkRaw(attr.value.value, attr)
                    }
                  }
                }
              }
            }
            // 如果有子节点，将子节点加入栈中继续遍历
            if (n.children && n.children.length) {
              stack.push(...n.children)
            }
          }
        }

        return {
          // 处理 VAttribute 节点（标准的 AST 访问器方式）
          VAttribute(node: any) {
            const key = node.key && (node.key.name || (node.key.argument && node.key.argument.name))
            if (!key) {
              return
            }
            if (key !== 'src' && key !== 'href') {
              return
            }
            if (!node.value || node.value.type !== 'VLiteral') {
              return
            }
            const raw = node.value.value
            checkRaw(raw, node)
          },
          // Program 节点退出时的钩子
          'Program:exit'(): void {
            try {
              const ast = context.getSourceCode().ast
              // vue-eslint-parser 将模板 AST 放在 ast.templateBody 中
              if (ast && ast.templateBody) {
                // 手动遍历模板 AST，确保捕获所有节点
                traverseTemplateBody(ast.templateBody)
              }
            } catch (err) {
              console.error('local/check-vue-asset-exists error:', err && err.message)
            }
          }
        }
      }
    }
  }
}

export default plugin
