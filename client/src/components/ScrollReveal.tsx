import React from "react";
import { motion, type MotionProps } from "framer-motion";

const revealVariants = {
  hidden: { opacity: 0, y: 28 },
  visible: { opacity: 1, y: 0 },
};

export type ScrollRevealProps = {
  children: React.ReactNode;
  delay?: number;
  className?: string;
} & Omit<MotionProps, "initial" | "animate" | "whileInView" | "variants">;

const ScrollReveal = React.forwardRef<HTMLDivElement, ScrollRevealProps>(
  ({ children, delay = 0, className, transition, ...rest }, ref) => {
    return (
      <motion.div
        ref={ref}
        className={className}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.2 }}
        variants={revealVariants}
        transition={{
          duration: 0.55,
          ease: [0.16, 0.84, 0.44, 1],
          delay,
          ...(transition ?? {}),
        }}
        {...rest}
      >
        {children}
      </motion.div>
    );
  }
);

ScrollReveal.displayName = "ScrollReveal";

export default ScrollReveal;
