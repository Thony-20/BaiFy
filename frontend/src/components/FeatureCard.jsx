import React from 'react';
import { Check } from "lucide-react";
import { motion } from "framer-motion";

/**
 * FeatureCard - Versión autocontenida para evitar dependencias externas de Shadcn UI.
 */
export function FeatureCard({
  title,
  description,
  items,
  buttonText,
  glowColor = "blue",
  onClick,
  isCurrentPlan = false,
  icon
}) {
  const glowColorMap = {
    violet: {
      glow: "bg-blue-600/40",
      button: "from-[#00C2FF] to-[#0047FF]",
      check: "bg-[#3B82F6]",
      border: "#3B82F6",
      accent: "#60A5FA"
    },
    pink: {
      glow: "bg-blue-600/40",
      button: "from-[#00C2FF] to-[#0047FF]",
      check: "bg-[#3B82F6]",
      border: "#3B82F6",
      accent: "#60A5FA"
    },
    emerald: {
      glow: "bg-blue-600/40",
      button: "from-[#00C2FF] to-[#0047FF]",
      check: "bg-[#3B82F6]",
      border: "#3B82F6",
      accent: "#60A5FA"
    },
    blue: {
      glow: "bg-blue-600/40",
      button: "from-[#00C2FF] to-[#0047FF]",
      check: "bg-[#3B82F6]",
      border: "#3B82F6",
      accent: "#60A5FA"
    },
    fuchsia: {
      glow: "bg-blue-600/40",
      button: "from-[#00C2FF] to-[#0047FF]",
      check: "bg-[#3B82F6]",
      border: "#3B82F6",
      accent: "#60A5FA"
    },
    bronze: {
        glow: "bg-blue-600/40",
        button: "from-[#00C2FF] to-[#0047FF]",
        check: "bg-[#3B82F6]",
        border: "#3B82F6",
        accent: "#60A5FA"
    },
    gold: {
        glow: "bg-blue-600/40",
        button: "from-[#00C2FF] to-[#0047FF]",
        check: "bg-[#3B82F6]",
        border: "#3B82F6",
        accent: "#60A5FA"
    }
  };

  const selected = glowColorMap[glowColor] || glowColorMap.blue;

  return (
    <motion.div
      whileHover="hover"
      whileTap={{ scale: 0.98 }}
      initial="initial"
      variants={{
        hover: { scale: 1.05 }
      }}
      transition={{ type: "spring", stiffness: 200, damping: 12 }}
      className="relative flex-1 w-full max-w-[320px] md:max-w-none flex flex-col mx-auto"
    >
      {/* Glow Effect - Optimized for performance and less overlap */}
      <motion.div
        className={`absolute -inset-2 rounded-3xl blur-2xl -z-20 ${selected.glow}`}
        variants={{
          initial: { scale: 1, opacity: 0.15 },
          hover: { scale: 1.15, opacity: 0.4 }
        }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      />

      <div className="relative h-full w-full rounded-2xl p-5 flex flex-col gap-4 bg-[#13111C] text-left text-white shadow-[0px_-16px_24px_rgba(255,255,255,0.05)_inset] overflow-hidden border border-white/5" style={{ isolation: 'isolate' }}>

        {/* Current Plan Badge */}
        {isCurrentPlan && (
            <div className={`absolute top-0 right-0 ${selected.check} text-white text-[10px] font-black px-4 py-1.5 rounded-bl-xl uppercase tracking-widest shadow-lg`}>
                Plan Actual
            </div>
        )}

        {/* Title + Description */}
        <div className="text-left">
          <h3 className="text-2xl font-bold tracking-tight text-white leading-none">{title}</h3>
          <p className="text-sm text-gray-400 mt-2 font-normal leading-relaxed">{description}</p>
        </div>

        <hr className="border-white/10" />

        {/* Feature List */}
        <div className="p-0 flex flex-col gap-3 flex-grow text-left">
          {items.map((item, index) => {
            const isIncluded = typeof item === 'string' ? true : item.included;
            const text = typeof item === 'string' ? item : item.text;

            return (
              <motion.div
                key={index}
                className={`flex items-start gap-4 ${!isIncluded ? 'opacity-40' : ''}`}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <span
                  className={`flex items-center justify-center w-6 h-6 rounded-full flex-shrink-0 shadow-md mt-0.5 ${
                    isIncluded ? `${selected.check} shadow-blue-500/20` : 'bg-gray-700'
                  }`}
                >
                  <Check className={`w-3.5 h-3.5 ${isIncluded ? 'text-white' : 'text-gray-500'}`} strokeWidth={4} />
                </span>
                <span className={`text-[15px] font-medium leading-snug ${isIncluded ? 'text-gray-200' : 'text-gray-500 line-through'}`}>
                  {text}
                </span>
              </motion.div>
            );
          })}
        </div>

        {/* Button */}
        <motion.div whileTap={{ scale: 0.95 }} className="mt-4">
          <button
            onClick={onClick}
            className={`w-full py-3 rounded-xl text-base font-bold bg-gradient-to-r ${selected.button} text-white shadow-[0_4px_20px_rgba(0,194,255,0.3)] cursor-pointer hover:brightness-110 transition-all active:scale-95`}
          >
            {buttonText}
          </button>
        </motion.div>
      </div>
    </motion.div>
  );
}
