# Skill: Offline Sync Debugging

## Purpose

Debug and resolve issues related to offline data synchronization, conflict resolution, and data consistency.

## When to Activate

- When data sync issues are reported
- When conflict resolution fails
- During offline-first feature development
- When data inconsistency is detected

## Common Issues

### 1. Stale Data Display
**Symptoms:** User sees outdated information
**Causes:** Cache not invalidated, subscription not active
**Debug:**
```javascript
// Check subscription status
console.log(subscription.state);

// Force refresh
await queryClient.invalidateQueries(['key']);
```

### 2. Conflict Resolution Failure
**Symptoms:** Data overwrites unexpectedly
**Causes:** Missing timestamp comparison, no merge strategy
**Debug:**
```javascript
// Check timestamps
console.log('Local:', localData.updated_at);
console.log('Remote:', remoteData.updated_at);

// Implement last-write-wins or manual merge
```

### 3. Subscription Memory Leak
**Symptoms:** Performance degradation over time
**Causes:** Subscriptions not cleaned up
**Debug:**
```javascript
// Check active subscriptions
supabase.getChannels().forEach(c => console.log(c.topic));

// Ensure cleanup
useEffect(() => {
  const sub = supabase.channel('x').subscribe();
  return () => sub.unsubscribe(); // CRITICAL
}, []);
```

## Debugging Checklist

- [ ] Verify network connectivity
- [ ] Check subscription state
- [ ] Validate cache status
- [ ] Review conflict resolution logic
- [ ] Check timestamp handling
- [ ] Verify cleanup on unmount
- [ ] Test with multiple clients

## Output Template

```markdown
# Offline Sync Debug Report

**Issue:** {description}
**Reported:** {date}
**Status:** Investigating | Resolved

## Symptoms

{detailed symptoms}

## Root Cause

{explanation}

## Resolution

{steps taken}

## Prevention

{how to prevent recurrence}
```