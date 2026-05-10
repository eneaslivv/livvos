import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { ProposalDocumentView } from '../components/proposals/ProposalDocumentView';
import { buildProposalDocumentData } from '../components/proposals/buildProposalDocumentData';

interface PublicProposalPayload {
  proposal: any;
  comments: any[];
}

/**
 * Public client-facing proposal page (anonymous, served by token).
 *
 * Renders the Livv "Sales Proposal v2" design (see
 * components/proposals/ProposalDocumentView). All proposal data flows
 * through `buildProposalDocumentData` which reads structured content
 * from `pricing_snapshot.document` when present and falls back to the
 * proposal's own columns otherwise — so old proposals keep working
 * while the AI generator is being upgraded to write the richer shape.
 *
 * Acceptance posts back through the existing
 * `submit_proposal_feedback` RPC.
 */
export const ProposalPublic: React.FC<{ token: string }> = ({ token }) => {
  const [data, setData] = useState<PublicProposalPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchProposal = async () => {
      setLoading(true);
      const { data, error } = await supabase.rpc('get_public_proposal', { p_token: token });
      if (error || !data) {
        setError(error?.message || 'Proposal not found');
        setLoading(false);
        return;
      }
      setData(data as PublicProposalPayload);
      setLoading(false);
    };
    fetchProposal();
  }, [token]);

  const documentData = useMemo(() => {
    if (!data?.proposal) return null;
    return buildProposalDocumentData(data.proposal);
  }, [data]);

  const handleAccept = async (payload: {
    tierId: string;
    addons: string[];
    total: number;
    signerName: string;
    signerRole: string;
  }) => {
    if (!data?.proposal) return;
    const consentText = data.proposal.consent_text
      || `Accepted ${payload.tierId} plan with ${payload.addons.length} add-ons. Total ${data.proposal.currency || 'USD'} ${payload.total}.`;
    const { error } = await supabase.rpc('submit_proposal_feedback', {
      p_token: token,
      p_status: 'approved',
      p_comment: `Plan: ${payload.tierId}; Add-ons: ${payload.addons.join(', ') || 'none'}; Total: ${payload.total}`,
      p_full_name: `${payload.signerName} · ${payload.signerRole}`,
      p_email: null,
      p_consent_text: consentText,
    });
    if (error) throw new Error(error.message);
  };

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#FDFBF7', color: '#5A3E3E',
        fontFamily: 'Inter, system-ui, sans-serif', fontSize: 14,
      }}>
        Loading proposal…
      </div>
    );
  }

  if (error || !data?.proposal || !documentData) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#FDFBF7', color: '#5A3E3E',
        fontFamily: 'Inter, system-ui, sans-serif', fontSize: 14,
      }}>
        {error || 'Proposal not found'}
      </div>
    );
  }

  const alreadyAccepted = !!data.proposal.approved_at;

  return (
    <ProposalDocumentView
      data={documentData}
      onAccept={handleAccept}
      alreadyAccepted={alreadyAccepted}
    />
  );
};
