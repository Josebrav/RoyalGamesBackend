export type BotChatCategory = 'greeting' | 'reaction' | 'postPrize';

export interface BotChatPhrase {
  key: string;
  text: string;
}

/**
 * Copy estático, no admin-editable a propósito (es texto, no config) — retocar la redacción acá
 * no afecta BingoBotPhraseLog porque lo que se registra es `key`, no `text`. Categorías:
 * `greeting` al entrar/cambiar de sala, `reaction` comentario genérico ocasional, `postPrize`
 * reacción a que alguien cantó premio.
 */
export const BOT_CHAT_PHRASES: Record<BotChatCategory, BotChatPhrase[]> = {
  greeting: [
    { key: 'greeting_1', text: 'holaaa' },
    { key: 'greeting_2', text: 'hola a todos' },
    { key: 'greeting_3', text: 'buenas!' },
    { key: 'greeting_4', text: 'holi' },
    { key: 'greeting_5', text: 'qué tal la sala' },
    { key: 'greeting_6', text: 'buenas tardes' },
    { key: 'greeting_7', text: 'hola gente' },
    { key: 'greeting_8', text: 'aca ando' },
  ],
  reaction: [
    { key: 'reaction_1', text: 'joderr' },
    { key: 'reaction_2', text: 'me gusta este juego' },
    { key: 'reaction_3', text: 'vamos que se puede' },
    { key: 'reaction_4', text: 'que emocion' },
    { key: 'reaction_5', text: 'dale dale' },
    { key: 'reaction_6', text: 'esta bueno esto' },
    { key: 'reaction_7', text: 'uy casi' },
    { key: 'reaction_8', text: 'vamooo' },
    { key: 'reaction_9', text: 'jajaja' },
    { key: 'reaction_10', text: 'que nervios' },
  ],
  postPrize: [
    { key: 'post_prize_1', text: 'oleeee' },
    { key: 'post_prize_2', text: 'felicitaciones!' },
    { key: 'post_prize_3', text: 'wow que suerte' },
    { key: 'post_prize_4', text: 'geniooo' },
    { key: 'post_prize_5', text: 'que crack' },
    { key: 'post_prize_6', text: 'yo quiero ganar asi' },
    { key: 'post_prize_7', text: 'bien ahi' },
    { key: 'post_prize_8', text: 'increible' },
  ],
};
