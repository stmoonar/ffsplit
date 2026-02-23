"use client";

import { LLMProvider } from "@/lib/types";
import {
    RiOpenaiFill,
    RiAnthropicFill,
    RiGeminiFill,
    RiDeepseekFill,
    RiAlibabaCloudFill,
    RiGrokAiFill,
    RiQwenAiFill,
    RiServerFill,
    RiMoonFill,
} from "@remixicon/react";

const ICON_MAP: Record<LLMProvider, typeof RiOpenaiFill> = {
    openai: RiOpenaiFill,
    claude: RiAnthropicFill,
    gemini: RiGeminiFill,
    deepseek: RiDeepseekFill,
    kimi: RiMoonFill,
    qwen: RiQwenAiFill,
    grok: RiGrokAiFill,
    ollama: RiServerFill,
};

interface ProviderIconProps {
    provider: LLMProvider;
    className?: string;
    size?: number | string;
}

export function ProviderIcon({ provider, className, size = 20 }: ProviderIconProps) {
    const Icon = ICON_MAP[provider];
    if (!Icon) return null;
    return <Icon className={className} size={size} />;
}
