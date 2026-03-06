export class ResourceLimitError extends Error {
  public resource: string;
  public used: number;
  public limit: number;

  constructor(resource: string, used: number, limit: number) {
    const labels: Record<string, string> = {
      max_projects: 'projects',
      max_users: 'team members',
      max_storage_mb: 'storage (MB)',
    };
    super(`You have reached the maximum of ${limit} ${labels[resource] || resource}. Upgrade your plan to add more.`);
    this.name = 'ResourceLimitError';
    this.resource = resource;
    this.used = used;
    this.limit = limit;
  }
}
