
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, Upload, FileSignature, KeyRound, ArrowRight, Check } from 'lucide-react';

interface Props {
  onComplete: (logo?: string) => void;
}

const Onboarding: React.FC<Props> = ({ onComplete }) => {
  const [step, setStep] = useState(1);
  const [selectedLogo, setSelectedLogo] = useState<string | null>(null);
  const totalSteps = 3;

  const handleLogoUpload = () => {
    // Simulated luxury placeholder logo
    const luxuryPlaceholder = "https://images.unsplash.com/photo-1614850523459-c2f4c699c52e?auto=format&fit=crop&q=80&w=200&h=200";
    setSelectedLogo(luxuryPlaceholder);
  };

  const nextStep = () => {
    if (step < totalSteps) {
      setStep(step + 1);
    } else {
      onComplete(selectedLogo || undefined);
    }
  };

  const stepsData = [
    {
      title: "Establish Identity",
      desc: "Synchronize your corporate aesthetic for customized environment mapping.",
      icon: <Upload size={36} className="text-brand-accent" />,
      label: "Upload Logo Assets"
    },
    {
      title: "Protocol Validation",
      desc: "Authorized electronic signature required to initialize Phase II engineering.",
      icon: <FileSignature size={36} className="text-brand-accent" />,
      label: "Legal Execution"
    },
    {
      title: "Secure Handshake",
      desc: "Inject primary access keys into the encrypted vault for system integration.",
      icon: <KeyRound size={36} className="text-brand-accent" />,
      label: "Deposit Access Keys"
    }
  ];

  return (
    <div className="flex items-center justify-center py-20 px-4">
      <motion.div 
        initial={{ scale: 0.98, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="w-full max-w-2xl bg-white/40 backdrop-blur-3xl border border-brand-dark/5 rounded-[3rem] p-10 md:p-16 relative overflow-hidden shadow-2xl"
      >
        <div className="absolute top-0 right-0 w-80 h-80 bg-brand-accent/5 blur-[120px]" />
        
        <div className="mb-12">
          <div className="flex gap-3 mb-10">
            {[1, 2, 3].map(s => (
              <div 
                key={s} 
                className={`h-1.5 flex-1 rounded-full transition-all duration-700 ${s <= step ? 'bg-brand-accent shadow-[0_2px_10px_rgba(130,43,46,0.3)]' : 'bg-brand-dark/5'}`} 
              />
            ))}
          </div>
          
          <span className="mono text-[10px] uppercase tracking-[0.6em] text-brand-dark/30 mb-3 block font-black italic underline decoration-brand-accent/20 underline-offset-8">Setup Protocol v1.4</span>
          <h2 className="text-5xl font-black mb-4 tracking-tighter text-brand-dark uppercase leading-none">{stepsData[step-1].title}</h2>
          <p className="text-brand-dark/50 text-base leading-relaxed max-w-[90%] font-medium">
            {stepsData[step-1].desc}
          </p>
        </div>

        <div 
          onClick={step === 1 ? handleLogoUpload : undefined}
          className={`bg-brand-cream/30 border border-brand-dark/5 rounded-[2rem] p-12 flex flex-col items-center justify-center border-dashed mb-12 group transition-all cursor-pointer shadow-inner ${step === 1 && selectedLogo ? 'border-brand-accent/40 bg-brand-accent/5' : 'hover:border-brand-accent/30'}`}
        >
          <div className="mb-8 p-6 bg-white rounded-[1.75rem] border border-brand-dark/5 group-hover:scale-110 group-hover:border-brand-accent/20 transition-all duration-700 shadow-xl shadow-brand-dark/5">
            {step === 1 && selectedLogo ? <Check size={36} className="text-brand-accent" /> : stepsData[step-1].icon}
          </div>
          <p className="text-[11px] font-black uppercase tracking-[0.4em] text-brand-dark/30 group-hover:text-brand-accent transition-colors">
            {step === 1 && selectedLogo ? "Logo Identified" : stepsData[step-1].label}
          </p>
        </div>

        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <ShieldCheck size={18} className="text-brand-accent animate-pulse" />
            <span className="text-[10px] mono text-brand-dark/20 uppercase tracking-[0.3em] font-black">Authorized Session Active</span>
          </div>
          
          <button 
            onClick={nextStep}
            className="flex items-center gap-4 px-10 py-5 bg-brand-dark text-brand-light font-black rounded-2xl hover:bg-brand-accent transition-all group shadow-2xl shadow-brand-dark/20"
          >
            <span className="uppercase tracking-[0.2em] text-xs">{step === 3 ? 'Initialize Dashboard' : 'Continue Phase'}</span>
            <ArrowRight size={22} className="group-hover:translate-x-2 transition-transform opacity-60" />
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default Onboarding;
