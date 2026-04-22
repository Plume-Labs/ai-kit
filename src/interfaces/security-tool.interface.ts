export type SecurityToolPreset = 'prompt-injection-guard' | 'pii-redactor' | 'content-policy-guard';

export interface IPromptInjectionGuardOptions {
  blockedPatterns?: string[];
}

export interface IPiiRedactorOptions {
  replacement?: string;
  redactEmails?: boolean;
  redactPhones?: boolean;
  redactIban?: boolean;
  redactCreditCards?: boolean;
}

export interface IContentPolicyGuardOptions {
  blockedTerms?: string[];
}

export interface ISecurityToolConfig {
  id: string;
  preset: SecurityToolPreset;
  name?: string;
  description?: string;
  promptInjection?: IPromptInjectionGuardOptions;
  piiRedactor?: IPiiRedactorOptions;
  contentPolicy?: IContentPolicyGuardOptions;
}

export interface ISecurityToolDescriptor {
  id: string;
  preset: SecurityToolPreset;
  name: string;
  description: string;
}
