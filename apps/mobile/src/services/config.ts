/**
 * Endereço da API.
 * Variáveis com o prefixo EXPO_PUBLIC_ são embutidas no app no momento do build.
 * Por isso NUNCA coloque segredos nelas: qualquer pessoa pode extraí-las do app.
 */
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1';
