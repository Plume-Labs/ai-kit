import { Inject } from '@nestjs/common';

/**
 * Génère le token d'injection pour un outil de sécurité enregistré.
 * Pattern : AI_KIT_SECURITY_TOOL:{id}
 */
export const getSecurityToolToken = (id: string): string => `AI_KIT_SECURITY_TOOL:${id}`;

/**
 * Décorateur pour injecter un outil de sécurité enregistré dans un service NestJS.
 */
export const InjectSecurityTool = (id: string) => Inject(getSecurityToolToken(id));
