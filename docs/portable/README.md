# Portable Documentation Packs

Self-contained documentation packs that can be lifted out of this repository and dropped into any project, knowledge base, or skill bundle without modification.

Each pack lives in its own folder. Cross-references inside a pack are relative and stay valid wherever the folder lands. Nothing here links back to the rest of this repository.

---

## Available packs

| Pack | What it covers |
|------|----------------|
| [swiss-design-system/](swiss-design-system/) | Swiss International Style design system — tokens, components, layouts, AI prompt template, anti-patterns |
| [nextjs-performance/](nextjs-performance/) | Next.js 15 performance optimizations — waterfalls, bundle size, Server Action security, server-side perf, pre-PR checklist |

---

## How to extract a pack

Each subfolder is independent. To move one to another location:

```bash
# Copy a pack into another project
cp -R docs/portable/swiss-design-system /path/to/other-project/docs/

# Or into a standalone skills repo
cp -R docs/portable/nextjs-performance /path/to/skills-repo/
```

No find-and-replace needed. The internal links use relative paths that resolve correctly regardless of where the folder lives.

---

## Why "portable"?

These docs originated as project-specific guides inside a larger codebase. They were generic enough to be useful anywhere — but the original versions had references to specific files, features, and conventions that made them awkward to reuse.

The versions in this folder have been rewritten so that:

1. **No project-specific references** — generic examples only
2. **No outbound links** — every link points to a sibling within the same pack
3. **Standalone reading** — each file makes sense in isolation
4. **Heavy structure** — split by topic, with explicit prerequisites and "when to apply" guidance

If you find a file that violates any of these rules, that's a bug — please fix it before distributing.
