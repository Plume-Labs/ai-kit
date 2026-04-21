import { Inject } from '@nestjs/common';

/**
 * Genere le token d'injection d'une memoire enregistree.
 * Pattern : AI_KIT_MEMORY:{id}
 */
export const getMemoryToken = (id: string): string => `AI_KIT_MEMORY:${id}`;

/**
 * Decorateur pour injecter une memoire enregistree.
 */
export const InjectMemory = (id: string) => Inject(getMemoryToken(id));
