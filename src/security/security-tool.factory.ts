import { StructuredTool, tool } from '@langchain/core/tools';
import { ISecurityToolConfig } from '../interfaces/security-tool.interface';

const DEFAULT_PROMPT_INJECTION_PATTERNS = [
  'ignore previous instructions',
  'ignore all previous instructions',
  'system prompt',
  'developer message',
  'reveal your instructions',
  'you are now',
  'jailbreak',
  'bypass safety',
];

const DEFAULT_BLOCKED_TERMS = ['self-harm', 'build a bomb', 'malware'];

const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_REGEX = /\b(?:\+\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?){2,4}\d{2,4}\b/g;
const IBAN_REGEX = /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/gi;
const CREDIT_CARD_REGEX = /\b(?:\d[ -]*?){13,19}\b/g;

/**
 * Factory interne qui construit des StructuredTool de sécurité à partir de presets.
 */
export class SecurityToolFactory {
  create(config: ISecurityToolConfig): StructuredTool {
    switch (config.preset) {
      case 'prompt-injection-guard':
        return this.createPromptInjectionGuard(config);
      case 'pii-redactor':
        return this.createPiiRedactor(config);
      case 'content-policy-guard':
        return this.createContentPolicyGuard(config);
      default:
        throw new Error(`[AiKit] Preset d'outil de sécurité inconnu : ${(config as any).preset}`);
    }
  }

  private createPromptInjectionGuard(config: ISecurityToolConfig): StructuredTool {
    const blockedPatterns = (config.promptInjection?.blockedPatterns ?? DEFAULT_PROMPT_INJECTION_PATTERNS).map((p) =>
      p.toLowerCase(),
    );

    return tool(
      async ({ text }: { text: string }) => {
        const lowered = text.toLowerCase();
        const matches = blockedPatterns.filter((pattern) => lowered.includes(pattern));
        return JSON.stringify({
          verdict: matches.length ? 'unsafe' : 'safe',
          matches,
        });
      },
      {
        name: config.name ?? config.id,
        description:
          config.description ??
          'Analyse un texte et détecte des signaux de prompt injection (contournement d\'instructions, jailbreak).',
        schema: {
          type: 'object',
          properties: {
            text: {
              type: 'string',
              description: 'Texte à analyser.',
            },
          },
          required: ['text'],
          additionalProperties: false,
        },
      },
    );
  }

  private createPiiRedactor(config: ISecurityToolConfig): StructuredTool {
    const replacement = config.piiRedactor?.replacement ?? '[REDACTED]';
    const redactEmails = config.piiRedactor?.redactEmails ?? true;
    const redactPhones = config.piiRedactor?.redactPhones ?? true;
    const redactIban = config.piiRedactor?.redactIban ?? true;
    const redactCreditCards = config.piiRedactor?.redactCreditCards ?? true;

    return tool(
      async ({ text }: { text: string }) => {
        let redacted = text;

        if (redactEmails) {
          redacted = redacted.replace(EMAIL_REGEX, replacement);
        }
        if (redactPhones) {
          redacted = redacted.replace(PHONE_REGEX, replacement);
        }
        if (redactIban) {
          redacted = redacted.replace(IBAN_REGEX, replacement);
        }
        if (redactCreditCards) {
          redacted = redacted.replace(CREDIT_CARD_REGEX, replacement);
        }

        return JSON.stringify({ redactedText: redacted });
      },
      {
        name: config.name ?? config.id,
        description:
          config.description ??
          'Masque les données sensibles (PII) dans un texte: e-mail, téléphone, IBAN, carte bancaire.',
        schema: {
          type: 'object',
          properties: {
            text: {
              type: 'string',
              description: 'Texte à nettoyer.',
            },
          },
          required: ['text'],
          additionalProperties: false,
        },
      },
    );
  }

  private createContentPolicyGuard(config: ISecurityToolConfig): StructuredTool {
    const blockedTerms = (config.contentPolicy?.blockedTerms ?? DEFAULT_BLOCKED_TERMS).map((term) =>
      term.toLowerCase(),
    );

    return tool(
      async ({ text }: { text: string }) => {
        const lowered = text.toLowerCase();
        const matches = blockedTerms.filter((term) => lowered.includes(term));
        return JSON.stringify({
          verdict: matches.length ? 'blocked' : 'allowed',
          matches,
        });
      },
      {
        name: config.name ?? config.id,
        description:
          config.description ??
          'Contrôle un texte selon une politique simple de termes interdits et retourne un verdict.',
        schema: {
          type: 'object',
          properties: {
            text: {
              type: 'string',
              description: 'Texte à vérifier.',
            },
          },
          required: ['text'],
          additionalProperties: false,
        },
      },
    );
  }
}
