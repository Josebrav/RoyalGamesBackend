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
 *
 * El pool es grande (~20 por categoría) a propósito: BingoBotChatService excluye una frase para
 * TODOS los bots una vez que la dijo cualquiera de ellos en el día (no por bot individual — ver
 * su comentario), así que con pocas frases se agotaban rápido y varios bots terminaban repitiendo
 * lo mismo el mismo día, delatándose. Cuantas más frases, más tarda en notarse incluso con muchos
 * bots activos.
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
    { key: 'greeting_9', text: 'hola!' },
    { key: 'greeting_10', text: 'buenass' },
    { key: 'greeting_11', text: 'qué onda' },
    { key: 'greeting_12', text: 'hola a to2' },
    { key: 'greeting_13', text: 'recién llego' },
    { key: 'greeting_14', text: 'buenas buenas' },
    { key: 'greeting_15', text: 'hola gente linda' },
    { key: 'greeting_16', text: 'qué tal' },
    { key: 'greeting_17', text: 'holis' },
    { key: 'greeting_18', text: 'buen día a todos' },
    { key: 'greeting_19', text: 'hola, cómo andan' },
    { key: 'greeting_20', text: 'aca estoy' },
    { key: 'greeting_21', text: 'volví' },
    { key: 'greeting_22', text: 'buenas a todos' },
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
    { key: 'reaction_11', text: 'dale que sale' },
    { key: 'reaction_12', text: 'uff por poco' },
    { key: 'reaction_13', text: 'estoy re concentrado' },
    { key: 'reaction_14', text: 'que sala mas activa' },
    { key: 'reaction_15', text: 'vamos vamos' },
    { key: 'reaction_16', text: 'esto esta picante' },
    { key: 'reaction_17', text: 'me encanta' },
    { key: 'reaction_18', text: 'a ver a ver' },
    { key: 'reaction_19', text: 'dale que dale' },
    { key: 'reaction_20', text: 'falta poco' },
    { key: 'reaction_21', text: 'vamo arriba' },
    { key: 'reaction_22', text: 'que tensión' },
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
    { key: 'post_prize_9', text: 'wow' },
    { key: 'post_prize_10', text: 'eso eso' },
    { key: 'post_prize_11', text: 'que grande' },
    { key: 'post_prize_12', text: 'felicidades campeon' },
    { key: 'post_prize_13', text: 'buenisimo' },
    { key: 'post_prize_14', text: 'que envidia sana' },
    { key: 'post_prize_15', text: 'asi se juega' },
    { key: 'post_prize_16', text: 'wow enserio' },
    { key: 'post_prize_17', text: 'tremendo' },
    { key: 'post_prize_18', text: 'que golazo' },
    { key: 'post_prize_19', text: 'bien merecido' },
    { key: 'post_prize_20', text: 'aplausos' },
    { key: 'post_prize_21', text: 'con gusto para la próxima yo' },
    { key: 'post_prize_22', text: 'suertudo/a' },
  ],
};
