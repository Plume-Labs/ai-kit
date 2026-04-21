import { Inject } from '@nestjs/common';

/**
 * Génère le token d'injection pour un outil enregistré.
 * Pattern : AI_KIT_TOOL:{id}
 */
export const getToolToken = (id: string): string => `AI_KIT_TOOL:${id}`;

/**
 * Décorateur pour injecter un outil enregistré dans un service NestJS.
 *
 * @example
 * ```ts
 * constructor(
 *   @InjectTool('search') searchTool: StructuredTool,
 * ) {}
 * ```
 */
export const InjectTool = (id: string) => Inject(getToolToken(id));
