import * as armyService from '../services/armyService.js';

const handleError = (res, error) => {
    const status = error.statusCode || 500;
    if (status === 500) console.error('Army error:', error);
    return res.status(status).json({ success: false, error: error.message });
};

export const listArmies = async (req, res) => {
    try {
        const data = await armyService.listArmies(req.user.id, req.query);
        return res.json({ success: true, data });
    } catch (error) {
        return handleError(res, error);
    }
};

export const getArmy = async (req, res) => {
    try {
        const data = await armyService.getArmy(req.user.id, req.params.id);
        return res.json({ success: true, data });
    } catch (error) {
        return handleError(res, error);
    }
};

export const createArmy = async (req, res) => {
    try {
        const army = await armyService.createArmy(req.user.id, req.body);
        return res.status(201).json({ success: true, data: army });
    } catch (error) {
        return handleError(res, error);
    }
};

export const updateArmy = async (req, res) => {
    try {
        const data = await armyService.updateArmy(req.user.id, req.params.id, req.body);
        return res.json({ success: true, data });
    } catch (error) {
        return handleError(res, error);
    }
};

export const deleteArmy = async (req, res) => {
    try {
        await armyService.deleteArmy(req.user.id, req.params.id);
        return res.json({ success: true, message: 'Army deleted successfully.' });
    } catch (error) {
        return handleError(res, error);
    }
};
