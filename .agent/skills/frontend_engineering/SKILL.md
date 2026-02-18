---
name: frontend_engineering
description: Guidelines and workflows for creating and modifying React components, pages, and UI, ensuring design system consistency.
---

# Frontend Engineering Skill

Use this skill for all UI/UX tasks, component creation, and page updates. This project uses **Next.js (Pages Router)**, **React**, **Tailwind CSS**, and **Lucide React** icons.

## Core Guidelines

### 1. Design System
- **Styling**: strictly use Tailwind CSS utility classes. Avoid custom CSS unless absolutely necessary (add to `index.css`).
- **Icons**: Use `lucide-react` for all icons.
  ```tsx
  import { User, Settings } from 'lucide-react';
  ```
- **Components**: Check `components/` for existing UI primitives before creating new ones.

### 2. Component Structure
Functional components with typed props:

```tsx
import React from 'react';
import { cn } from '@/lib/utils'; // Assuming cn utility exists, else use clsx/tailwind-merge

interface MyComponentProps {
  className?: string;
  title: string;
}

export const MyComponent: React.FC<MyComponentProps> = ({ className, title }) => {
  return (
    <div className={cn("p-4 bg-white rounded-lg shadow", className)}>
      <h2 className="text-xl font-bold">{title}</h2>
    </div>
  );
};
```

### 3. State Management
- Use local state (`useState`, `useReducer`) for component-specific logic.
- Use Context (`context/`) for global state (Auth, Theme, etc.).

### 4. Page Creation
- Create new pages in `pages/` directory.
- Ensure generic page layout wrapper is used (e.g., `<Layout>...</Layout>` if applicable).

## Common Workflows

### Creating a New Page
1. Create `pages/NewFeature.tsx`.
2. define the route and component.
3. Add navigation links if necessary.

### Refactoring UI
1. Identify the component in `components/`.
2. Apply changes incrementally.
3. Verify responsiveness (mobile/desktop).

## Best Practices
- **Mobile First**: Write classes like `w-full md:w-1/2`.
- **Accessibility**: Use semantic HTML (`<button>`, `<nav>`, `<main>`).
- **Performance**: Use dynamic imports for heavy components if needed.
