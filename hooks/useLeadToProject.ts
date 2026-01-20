import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useProjects, ProjectStatus } from '../context/ProjectsContext';
import { Lead } from '../types';

interface ConversionOptions {
    /** Custom project name (defaults to lead name/company) */
    projectName?: string;
    /** Initial project status */
    status?: ProjectStatus;
    /** Whether to mark lead as closed after conversion */
    markLeadClosed?: boolean;
    /** Additional project metadata */
    metadata?: Record<string, any>;
}

interface ConversionResult {
    success: boolean;
    projectId?: string;
    error?: string;
}

/**
 * Hook for converting leads to projects
 * Provides functionality to transform a sales lead into a managed project
 */
export const useLeadToProject = () => {
    const { createProject } = useProjects();
    const [isConverting, setIsConverting] = useState(false);
    const [lastConversion, setLastConversion] = useState<ConversionResult | null>(null);

    /**
     * Convert a lead to a project
     * @param lead The lead to convert
     * @param options Conversion options
     * @returns ConversionResult with success status and project ID
     */
    const convertLeadToProject = useCallback(async (
        lead: Lead,
        options: ConversionOptions = {}
    ): Promise<ConversionResult> => {
        setIsConverting(true);
        setLastConversion(null);

        try {
            // 1. Determine project name
            const projectName = options.projectName ||
                lead.company ||
                lead.name ||
                `Project from Lead ${lead.id.slice(0, 8)}`;

            // 2. Build project description from lead data
            const description = buildProjectDescription(lead);

            // 3. Create the project using ProjectsContext
            const newProject = await createProject({
                title: projectName,
                description,
                status: options.status || 'planning',
                client_id: null, // Could be linked to a client if we create one from the lead
                deadline: null,
                progress: 0,
                tasks: [],
                members: [],
                files: [],
            });

            if (!newProject?.id) {
                throw new Error('Failed to create project');
            }

            // 4. Store conversion metadata in project
            try {
                await supabase
                    .from('projects')
                    .update({
                        metadata: {
                            ...options.metadata,
                            converted_from_lead: lead.id,
                            lead_source: lead.source,
                            lead_temperature: lead.temperature,
                            original_lead_message: lead.message,
                            conversion_date: new Date().toISOString(),
                        }
                    })
                    .eq('id', newProject.id);
            } catch (e) {
                // Metadata update is optional, continue if fails
                console.warn('Could not update project metadata:', e);
            }

            // 5. Mark lead as closed/won if requested
            if (options.markLeadClosed !== false) {
                try {
                    await supabase
                        .from('leads')
                        .update({
                            status: 'closed',
                            converted_to_project_id: newProject.id,
                            converted_at: new Date().toISOString()
                        })
                        .eq('id', lead.id);
                } catch (e) {
                    // Lead update is optional, continue if fails
                    console.warn('Could not update lead status:', e);
                }
            }

            // 6. Create a notification for the conversion
            try {
                const { data: profile } = await supabase.auth.getUser();
                if (profile?.user?.id) {
                    await supabase.rpc('create_notification', {
                        p_user_id: profile.user.id,
                        p_type: 'project',
                        p_title: `Lead converted: ${projectName}`,
                        p_message: `${lead.name || 'Lead'} has been converted to a new project`,
                        p_link: '/projects',
                        p_metadata: { project_id: newProject.id, lead_id: lead.id }
                    });
                }
            } catch (e) {
                // Notification is optional
                console.warn('Could not create conversion notification:', e);
            }

            const result: ConversionResult = {
                success: true,
                projectId: newProject.id,
            };

            setLastConversion(result);
            return result;

        } catch (err: any) {
            console.error('Error converting lead to project:', err);
            const result: ConversionResult = {
                success: false,
                error: err.message || 'Unknown error occurred',
            };
            setLastConversion(result);
            return result;

        } finally {
            setIsConverting(false);
        }
    }, [createProject]);

    /**
     * Check if a lead has already been converted
     */
    const checkLeadConverted = useCallback(async (leadId: string): Promise<boolean> => {
        try {
            const { data } = await supabase
                .from('leads')
                .select('converted_to_project_id')
                .eq('id', leadId)
                .single();

            return !!data?.converted_to_project_id;
        } catch {
            return false;
        }
    }, []);

    return {
        convertLeadToProject,
        checkLeadConverted,
        isConverting,
        lastConversion,
    };
};

/**
 * Build a project description from lead data
 */
function buildProjectDescription(lead: Lead): string {
    const parts: string[] = [];

    if (lead.message) {
        parts.push(`**Original Request:**\n${lead.message}`);
    }

    if (lead.company) {
        parts.push(`**Company:** ${lead.company}`);
    }

    if (lead.name) {
        parts.push(`**Contact:** ${lead.name}`);
    }

    if (lead.email) {
        parts.push(`**Email:** ${lead.email}`);
    }

    if (lead.phone) {
        parts.push(`**Phone:** ${lead.phone}`);
    }

    if (lead.source) {
        parts.push(`**Source:** ${lead.source}`);
    }

    if (lead.budget) {
        parts.push(`**Budget:** $${lead.budget.toLocaleString()}`);
    }

    if (lead.category) {
        parts.push(`**Category:** ${lead.category}`);
    }

    parts.push(`\n---\n*Converted from lead on ${new Date().toLocaleDateString()}*`);

    return parts.join('\n\n');
}
