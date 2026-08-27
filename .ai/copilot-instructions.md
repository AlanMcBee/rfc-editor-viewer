# Copilot Instructions (Repository Local)

- Keep enhancements scoped to RFC article content (`div.rfc-content`) and avoid changing unrelated page behavior.
- Favor resilient parsing with fallback to monospace rendering when confidence is low.
- Keep interactive controls keyboard-accessible first, then pointer/touch friendly.
- Persist user-facing formatting state in local storage.
- Preserve an architecture that can later support remote profile sync without requiring it now.
- Prefer npm-managed dependencies for security visibility (Dependabot compatibility).
