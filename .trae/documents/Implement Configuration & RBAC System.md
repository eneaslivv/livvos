I have analyzed the current project structure and database schema. The project uses React + Vite + Supabase but lacks the necessary database tables and frontend components for the requested RBAC (Role-Based Access Control) system.

Here is the implementation plan:

## 1. Database Schema & Migration
I will create a new migration file `migrations/2025-12-29_rbac_system.sql` to set up the foundation:
- **`profiles`**: Links to `auth.users` with user metadata (name, avatar, status).
- **`roles`**: Defines roles (Owner, Admin, Manager, Sales, Finance, Viewer).
- **`permissions`**: Granular permissions (e.g., `sales.view`, `crm.edit`).
- **`role_permissions`**: Maps roles to specific permissions.
- **`user_roles`**: Assigns roles to users.
- **`services`**: Manages toggleable modules/services.
- **`payment_processors`**: Stores payment configuration.
- **RLS Policies**: Row Level Security policies to protect these tables.
- **Seed Data**: Default roles and permissions.

## 2. Frontend Core (Types & Context)
- **`types/rbac.ts`**: Define TypeScript interfaces for the new system.
- **`context/RBACContext.tsx`**: A new React Context to:
    - Fetch the current user's profile, roles, and permissions.
    - Provide helper functions: `hasPermission(module, action)`, `hasRole(role)`.
    - Handle loading states and security checks.

## 3. Configuration UI Components
I will create a modular configuration system in `components/config/`:
- **`ConfigurationModal.tsx`**: The main modal container with navigation tabs (General, Services, Payments, Users).
- **`GeneralSettings.tsx`**: Workspace settings.
- **`ServiceManagement.tsx`**: Toggle available modules.
- **`PaymentSettings.tsx`**: Manage payment processors (restricted to Finance role).
- **`UserManagement.tsx`**: The core user management interface (Invite, Edit Roles, Suspend).

## 4. Integration
- **`components/TopNavbar.tsx`**: Add the User/Avatar button to trigger the Configuration Modal.
- **`pages/Home.tsx`**: Update the dashboard to render content dynamically based on the user's role (e.g., Sales view vs. Finance view).
- **`App.tsx`**: Wrap the application with `RBACProvider`.

## 5. Verification
- Verify the SQL migration file correctness.
- Verify the UI components compile and render correctly.
- Ensure the permission logic correctly hides/shows elements based on the mocked/loaded role.
