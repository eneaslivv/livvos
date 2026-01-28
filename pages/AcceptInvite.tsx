import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Icons } from '../components/ui/Icons';

export const AcceptInvite: React.FC = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isValidToken, setIsValidToken] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [inviteType, setInviteType] = useState<string>('team');

    // Get token from URL
    const queryParams = new URLSearchParams(window.location.search);
    const token = queryParams.get('token');

    useEffect(() => {
        if (!token) {
            setIsLoading(false);
            setError('Invalid invitation link. Please check your URL.');
            return;
        }

        const verifyToken = async () => {
            try {
                // Verify invitation existence
                const { data, error } = await supabase
                    .from('invitations')
                    .select('email, status, type')
                    .eq('token', token)
                    .single();

                if (error || !data) {
                    setError('Invitation not found or expired.');
                } else if (data.status === 'accepted') {
                    setError('This invitation has already been used.');
                } else {
                    setEmail(data.email);
                    setInviteType(data.type || 'team');
                    setIsValidToken(true);
                }
            } catch (err) {
                setError('An error occurred while verifying the invitation.');
            } finally {
                setIsLoading(false);
            }
        };

        verifyToken();
    }, [token]);

    const handleSignup = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!password || password.length < 6) {
            setError('Password must be at least 6 characters long.');
            return;
        }

        setIsSubmitting(true);
        setError(null);

        try {
            // 1. Sign up the user
            const { data: authData, error: authError } = await supabase.auth.signUp({
                email,
                password,
            });

            if (authError) throw authError;

            // 2. The database trigger 'handle_new_user' will automatically:
            //    - Find the invitation by email
            //    - Assign the correct role
            //    - Create the profile
            //    - Mark invitation as accepted

            // 3. Login immediately (SignUp returns session if email confirmation is disabled or not required for this flow)
            // If session is null (email confirm required), we might need to tell user to check email.
            // But usually we want direct access.
            
            if (authData.session) {
                 window.location.href = inviteType === 'client' ? '/?portal=client' : '/';
            } else {
                 // If Supabase requires email confirmation
                 alert("Registration successful! Please check your email to confirm your account.");
                 window.location.href = '/auth';
            }

        } catch (err: any) {
            setError(err.message || 'Failed to register.');
            setIsSubmitting(false);
        }
    };

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-black text-zinc-500">
                <Icons.Clock className="animate-spin mr-2" /> Verifying invitation...
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-black p-4">
                <div className="w-full max-w-md bg-white dark:bg-zinc-900 border border-red-200 dark:border-red-900/30 rounded-2xl p-8 text-center shadow-xl">
                    <div className="w-16 h-16 bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Icons.Alert size={32} />
                    </div>
                    <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">Invitation Error</h2>
                    <p className="text-zinc-500 mb-6">{error}</p>
                    <a href="/auth" className="text-indigo-600 hover:underline">Go to Login</a>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-black p-4">
            <div className="w-full max-w-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 shadow-2xl">
                <div className="text-center mb-8">
                    <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Icons.Mail size={32} />
                    </div>
                    <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">You've been invited!</h2>
                    <p className="text-zinc-500 mt-2">
                        Complete your registration to join <b>Eneas OS</b>.
                    </p>
                </div>

                <form onSubmit={handleSignup} className="space-y-4">
                    <div>
                        <label className="block text-xs font-medium text-zinc-500 mb-1">Email</label>
                        <input 
                            type="email" 
                            value={email} 
                            disabled 
                            className="w-full px-4 py-3 bg-zinc-100 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-500 cursor-not-allowed"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-zinc-500 mb-1">Set Password</label>
                        <input 
                            type="password" 
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            className="w-full px-4 py-3 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                            autoFocus
                            required
                        />
                    </div>

                    <button 
                        type="submit" 
                        disabled={isSubmitting}
                        className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-all shadow-lg shadow-indigo-500/20 disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {isSubmitting ? <Icons.Clock className="animate-spin" size={18}/> : null}
                        {isSubmitting ? 'Creating Account...' : 'Complete Registration'}
                    </button>
                </form>
            </div>
        </div>
    );
};
