# Skill: UI Consistency Review

## Purpose

Review and ensure UI components follow design system, accessibility standards, and UX patterns consistently.

## When to Activate

- During code review
- Before major UI releases
- When UX issues are reported
- During accessibility audits

## Review Checklist

### Visual Consistency

- [ ] Colors match design system
- [ ] Typography follows scale
- [ ] Spacing uses defined tokens
- [ ] Icons are from approved set
- [ ] Shadows and borders consistent

### Interactive Elements

- [ ] Buttons have hover/active states
- [ ] Form inputs have focus states
- [ ] Links are distinguishable
- [ ] Clickable areas are adequate size (44x44px min)
- [ ] Loading states are shown

### Responsive Design

- [ ] Works on mobile (320px+)
- [ ] Works on tablet (768px+)
- [ ] Works on desktop (1024px+)
- [ ] No horizontal scroll
- [ ] Touch targets adequate

### Accessibility (a11y)

- [ ] Color contrast meets WCAG AA
- [ ] All images have alt text
- [ ] Form inputs have labels
- [ ] Keyboard navigation works
- [ ] Screen reader compatible
- [ ] Focus visible
- [ ] No reliance on color alone

### State Handling

- [ ] Loading state
- [ ] Error state
- [ ] Empty state
- [ ] Success state
- [ ] Partial data state

## Output Template

```markdown
# UI Consistency Review

**Component/Page:** {name}
**Reviewer:** {agent/person}
**Date:** {date}

## Summary

| Category | Status |
|----------|--------|
| Visual | ✅ Pass / ⚠️ Issues |
| Interactive | ✅ Pass / ⚠️ Issues |
| Responsive | ✅ Pass / ⚠️ Issues |
| Accessibility | ✅ Pass / ⚠️ Issues |
| States | ✅ Pass / ⚠️ Issues |

## Issues Found

| Issue | Severity | Location | Recommendation |
|-------|----------|----------|----------------|
| {issue} | {level} | {file:line} | {fix} |

## Recommendations

1. {recommendation}
```