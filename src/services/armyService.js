import { supabase } from '../config/supabase.js';
import { AppError } from '../utils/AppError.js';

const VALID_BATTLE_MODES = [1, 3, 6, 10];

const POSITION_PREFIXES = {
    creature: 'grid-creature-',
    battlegear: 'grid-battlegear-',
    attack: 'grid-attack',
    mugic: 'grid-mugic',
    location: 'grid-location',
};

function validateInput({ name, battle_mode }) {
    if (!name || name.trim().length < 3 || name.trim().length > 50) {
        throw new AppError('Army name must be 3-50 characters.', 400);
    }

    if (!battle_mode || !VALID_BATTLE_MODES.includes(parseInt(battle_mode))) {
        throw new AppError('Valid battle mode required (1, 3, 6, or 10).', 400);
    }
}

function validateCards(cards, battleMode) {
    if (!Array.isArray(cards) || cards.length === 0) {
        throw new AppError('Cards is required and cannot be empty.', 400);
    }

    const mode = parseInt(battleMode);

    for (const card of cards) {
        if (!card.card_id || !card.position) {
            throw new AppError('Each card must have card and position.', 400);
        }
    }

    const creatures = cards.filter(c => c.position.startsWith(POSITION_PREFIXES.creature));
    const battlegears = cards.filter(c => c.position.startsWith(POSITION_PREFIXES.battlegear));
    const attacks = cards.filter(c => c.position.startsWith(POSITION_PREFIXES.attack));
    const mugics = cards.filter(c => c.position.startsWith(POSITION_PREFIXES.mugic));
    const locations = cards.filter(c => c.position.startsWith(POSITION_PREFIXES.location));

    if (creatures.length !== mode) {
        throw new AppError(`Battle mode ${mode} requires exactly ${mode} creature(s), got ${creatures.length}.`, 400);
    }

    if (battlegears.length !== mode) {
        throw new AppError(`Battle mode ${mode} requires exactly ${mode} battlegear(s), got ${battlegears.length}.`, 400);
    }

    if (mugics.length !== mode) {
        throw new AppError(`Battle mode ${mode} requires exactly ${mode} mugic(s), got ${mugics.length}.`, 400);
    }

    if (locations.length !== mode) {
        throw new AppError(`Battle mode ${mode} requires exactly ${mode} location(s), got ${locations.length}.`, 400);
    }

    if (attacks.length !== 20) {
        throw new AppError(`Deck must have exactly 20 attack cards, got ${attacks.length}.`, 400);
    }

    const attackCounts = {};
    for (const atk of attacks) {
        attackCounts[atk.card_id] = (attackCounts[atk.card_id] || 0) + 1;
        if (attackCounts[atk.card_id] > 2) {
            throw new AppError(`Cannot use more than 2 copies of the same attack card (card ${atk.card_id}).`, 400);
        }
    }
}

async function checkCardOwnership(userId, cards) {
    const cardIds = [...new Set(cards.map(c => c.card_id))];

    const { data: owned, error } = await supabase
        .from('user_collection')
        .select('card_id, quantity')
        .eq('user_id', userId)
        .in('card_id', cardIds);

    if (error) {
        throw new AppError('Failed to verify card ownership.', 500);
    }

    const ownedMap = new Map(owned.map(o => [o.card_id, o.quantity]));

    const usageCount = {};
    for (const card of cards) {
        usageCount[card.card_id] = (usageCount[card.card_id] || 0) + 1;
    }

    for (const [cardId, needed] of Object.entries(usageCount)) {
        const available = ownedMap.get(cardId) || 0;
        if (available < needed) {
            throw new AppError(`You don't own enough copies of card ${cardId}. Need ${needed}, have ${available}.`, 400);
        }
    }
}

async function validateAttackBuildPoints(cards) {
    const attacks = cards.filter(c => c.position.startsWith(POSITION_PREFIXES.attack));
    const attackCardIds = [...new Set(attacks.map(a => a.card_id))];

    const { data, error } = await supabase
        .from('cards_view')
        .select('card_id, build_points')
        .in('card_id', attackCardIds);

    if (error) {
        throw new AppError('Failed to validate build points.', 500);
    }

    const bpMap = new Map(data.map(d => [d.card_id, d.build_points || 0]));

    let totalBp = 0;
    for (const atk of attacks) {
        totalBp += bpMap.get(atk.card_id) || 0;
    }

    if (totalBp > 20) {
        throw new AppError(`Total attack Build Points cannot exceed 20, got ${totalBp}.`, 400);
    }
}

const CARD_SELECT = `
    id, position, slot_order,
    cards_view (
        card_id, card_type, code, name, image_url,
        creature_tribe, build_points, mugic_cost,
        location_initiative, rarity_id,
        creature_courage, creature_power, creature_wisdom, creature_speed, creature_energy,
        attack_bp_cost, attack_damage, attack_elements
    )
`;

async function fetchArmyCards(deckId) {
    const { data } = await supabase
        .from('deck_cards')
        .select(CARD_SELECT)
        .eq('deck_id', deckId)
        .order('position')
        .order('slot_order');

    return (data || []).filter(c => c.cards_view !== null);
}

async function assertDeckOwnership(userId, deckId) {
    const { data: deck, error } = await supabase
        .from('decks')
        .select('*')
        .eq('id', deckId)
        .eq('user_id', userId)
        .single();

    if (error || !deck) {
        throw new AppError('Army not found.', 404);
    }

    return deck;
}

export async function listArmies(userId, { battle_mode } = {}) {
    let query = supabase
        .from('decks')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

    if (battle_mode) {
        query = query.eq('battle_mode', parseInt(battle_mode));
    }

    const { data, error } = await query;

    if (error) {
        throw new AppError('Failed to fetch armies.', 500);
    }

    return data;
}

export async function getArmy(userId, deckId) {
    const deck = await assertDeckOwnership(userId, deckId);
    const cards = await fetchArmyCards(deck.id);

    return { ...deck, cards };
}

export async function createArmy(userId, { name, battle_mode, description, cards }) {
    validateInput({ name, battle_mode });
    validateCards(cards, battle_mode);
    await checkCardOwnership(userId, cards);
    await validateAttackBuildPoints(cards);

    const { data: deck, error: deckError } = await supabase
        .from('decks')
        .insert({
            user_id: userId,
            name: name.trim(),
            battle_mode: parseInt(battle_mode),
            is_temporary: false,
            is_valid: false,
            description: description || null,
        })
        .select()
        .single();

    if (deckError) {
        if (deckError.message?.includes('Limite de 5 decks')) {
            throw new AppError('Deck limit reached (max 5).', 409);
        }
        throw new AppError('Failed to create army.', 500);
    }

    const deckCards = cards.map(c => ({
        deck_id: deck.id,
        card_id: c.card_id,
        position: c.position,
        slot_order: c.slot_order || null,
    }));

    const { error: cardsError } = await supabase
        .from('deck_cards')
        .insert(deckCards);

    if (cardsError) {
        await supabase.from('decks').delete().eq('id', deck.id);

        if (cardsError.message?.includes('Build Points')) {
            throw new AppError(cardsError.message, 400);
        }
        throw new AppError('Failed to add cards to army.', 500);
    }

    const armyCards = await fetchArmyCards(deck.id);
    return { ...deck, cards: armyCards };
}

export async function updateArmy(userId, deckId, { name, description, battle_mode, cards }) {
    const deck = await assertDeckOwnership(userId, deckId);

    const updates = { updated_at: new Date().toISOString() };
    if (name !== undefined) {
        if (name.trim().length < 3 || name.trim().length > 50) {
            throw new AppError('Army name must be 3-50 characters.', 400);
        }
        updates.name = name.trim();
    }
    if (description !== undefined) updates.description = description || null;
    if (battle_mode !== undefined) {
        if (!VALID_BATTLE_MODES.includes(parseInt(battle_mode))) {
            throw new AppError('Valid battle_mode required (1, 3, 6, or 10).', 400);
        }
        updates.battle_mode = parseInt(battle_mode);
    }

    const { error: updateError } = await supabase
        .from('decks')
        .update(updates)
        .eq('id', deckId);

    if (updateError) {
        throw new AppError('Failed to update army.', 500);
    }

    if (Array.isArray(cards)) {
        const mode = battle_mode ? parseInt(battle_mode) : deck.battle_mode;
        validateCards(cards, mode);
        await checkCardOwnership(userId, cards);
        await validateAttackBuildPoints(cards);

        const { error: deleteError } = await supabase
            .from('deck_cards')
            .delete()
            .eq('deck_id', deckId);

        if (deleteError) {
            throw new AppError('Failed to clear army cards.', 500);
        }

        const deckCards = cards.map(c => ({
            deck_id: deckId,
            card_id: c.card_id,
            position: c.position,
            slot_order: c.slot_order || null,
        }));

        const { error: cardsError } = await supabase
            .from('deck_cards')
            .insert(deckCards);

        if (cardsError) {
            if (cardsError.message?.includes('Build Points')) {
                throw new AppError(cardsError.message, 400);
            }
            throw new AppError('Failed to update army cards.', 500);
        }
    }

    const { data: updatedDeck } = await supabase
        .from('decks')
        .select('*')
        .eq('id', deckId)
        .single();

    const armyCards = await fetchArmyCards(deckId);
    return { ...updatedDeck, cards: armyCards };
}

export async function deleteArmy(userId, deckId) {
    await assertDeckOwnership(userId, deckId);

    const { error } = await supabase
        .from('decks')
        .delete()
        .eq('id', deckId);

    if (error) {
        throw new AppError('Failed to delete army.', 500);
    }
}
