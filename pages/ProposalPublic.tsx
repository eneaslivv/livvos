import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Icons } from '../components/ui/Icons';

interface PublicProposalPayload {
  proposal: any;
  comments: any[];
}

export const ProposalPublic: React.FC<{ token: string }> = ({ token }) => {
  const [data, setData] = useState<PublicProposalPayload | null>(null);
  const [portfolio, setPortfolio] = useState<any[]>([]);
  const [comment, setComment] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchProposal = async () => {
      setLoading(true);
      const { data, error } = await supabase.rpc('get_public_proposal', { p_token: token });
      if (error || !data) {
        setError(error?.message || 'Propuesta no encontrada');
        setLoading(false);
        return;
      }
      setData(data as PublicProposalPayload);
      const { data: portfolioData } = await supabase.rpc('get_public_portfolio', { p_token: token });
      if (Array.isArray(portfolioData)) setPortfolio(portfolioData as any[]);
      setLoading(false);
    };
    fetchProposal();
  }, [token]);

  const handleFeedback = async (status: 'approved' | 'rejected') => {
    if (status === 'approved' && (!fullName.trim() || !email.trim())) {
      setError('Please enter name and email to sign.');
      return;
    }
    const { error } = await supabase.rpc('submit_proposal_feedback', {
      p_token: token,
      p_status: status,
      p_comment: comment,
      p_full_name: fullName.trim() || null,
      p_email: email.trim() || null,
      p_consent_text: data?.proposal?.consent_text || null
    });
    if (error) {
      setError(error.message);
      return;
    }
    setComment('');
    const { data: refreshed } = await supabase.rpc('get_public_proposal', { p_token: token });
    if (refreshed) setData(refreshed as PublicProposalPayload);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-zinc-500">Cargando propuesta...</div>
    );
  }

  if (error || !data?.proposal) {
    return (
      <div className="min-h-screen flex items-center justify-center text-zinc-500">{error || 'Propuesta no encontrada'}</div>
    );
  }

  const proposal = data.proposal;
  const consentText = proposal.consent_text || 'By approving, you agree to the scope, timeline, and pricing outlined above.';

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="max-w-3xl mx-auto p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">{proposal.title}</h1>
            <p className="text-xs text-zinc-500">Estado: {proposal.status}</p>
          </div>
          <div className="text-xs text-zinc-500">{proposal.currency || 'USD'}</div>
        </div>

        <div className="bg-white rounded-2xl border border-zinc-200 p-6 whitespace-pre-wrap text-sm">
          {proposal.content || 'Propuesta en preparación'}
        </div>

        {proposal.timeline?.items?.length ? (
          <div className="mt-6 bg-white rounded-2xl border border-zinc-200 p-6">
            <h3 className="text-sm font-semibold mb-3">Timeline</h3>
            <div className="space-y-3">
              {proposal.timeline.items.map((item: any) => (
                <div key={item.week} className="text-xs">
                  <div className="font-semibold text-zinc-800">{item.title}</div>
                  <div className="text-zinc-500">{item.detail}</div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {proposal.pricing_total ? (
          <div className="mt-6 bg-white rounded-2xl border border-zinc-200 p-6">
            <h3 className="text-sm font-semibold mb-2">Pricing</h3>
            <div className="text-lg font-bold text-zinc-900">
              {proposal.currency || 'USD'} {Number(proposal.pricing_total).toFixed(2)}
            </div>
          </div>
        ) : null}

        {portfolio.length ? (
          <div className="mt-6 bg-white rounded-2xl border border-zinc-200 p-6">
            <h3 className="text-sm font-semibold mb-3">Portfolio References</h3>
            <div className="space-y-2">
              {portfolio.map((item) => (
                <a key={item.id} href={item.url} target="_blank" rel="noreferrer" className="text-xs text-indigo-600">
                  {item.title}
                </a>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-3">
          <button
            onClick={() => handleFeedback('approved')}
            className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-emerald-600 text-white text-sm font-semibold"
          >
            <Icons.Check size={16} /> Aprobar
          </button>
          <button
            onClick={() => handleFeedback('rejected')}
            className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-rose-600 text-white text-sm font-semibold"
          >
            <Icons.X size={16} /> Rechazar
          </button>
        </div>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-3">
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Full name"
            className="px-3 py-2 rounded-lg border border-zinc-200 bg-white text-sm"
          />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="px-3 py-2 rounded-lg border border-zinc-200 bg-white text-sm"
          />
        </div>

        <div className="mt-4 text-xs text-zinc-500">
          {consentText}
        </div>

        <div className="mt-6">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Comentarios o cambios sugeridos"
            className="w-full min-h-[120px] p-4 rounded-xl border border-zinc-200 bg-white text-sm"
          />
        </div>

        <div className="mt-6">
          <h3 className="text-sm font-semibold">Comentarios</h3>
          <div className="space-y-2 mt-2">
            {(data.comments || []).map((c: any) => (
              <div key={c.id} className={`text-xs p-3 rounded-lg ${c.is_client ? 'bg-blue-50' : 'bg-zinc-100'}`}>
                {c.comment}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
