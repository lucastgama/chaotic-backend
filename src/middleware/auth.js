import jwt from 'jsonwebtoken';
import { supabase } from '../config/supabase.js';

const SESSION_INACTIVITY_MINUTES = 180;
const LAST_SEEN_THROTTLE_SECONDS = 60;

export const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({
            success: false,
            error: 'Token not provided.',
            code: 'NO_TOKEN',
        });
    }

    let decoded;
    try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
        return res.status(401).json({
            success: false,
            error: 'Invalid or expired token.',
            code: 'INVALID_TOKEN',
        });
    }

    if (!decoded.sessionId) {
        return res.status(401).json({
            success: false,
            error: 'Session ID missing from token.',
            code: 'INVALID_TOKEN',
        });
    }

    try {
        const now = new Date();

        const { data: session, error: sessionError } = await supabase
            .from('sessions')
            .select('id, last_seen_at, expires_at, is_active')
            .eq('id', decoded.sessionId)
            .eq('user_id', decoded.id)
            .single();

        if (sessionError || !session) {
            return res.status(401).json({
                success: false,
                error: 'Session not found.',
                code: 'SESSION_EXPIRED',
            });
        }

        if (!session.is_active) {
            return res.status(401).json({
                success: false,
                error: 'Session was invalidated by a new login.',
                code: 'SESSION_EXPIRED',
            });
        }

        if (now > new Date(session.expires_at)) {
            await supabase
                .from('sessions')
                .update({ is_active: false })
                .eq('id', session.id);

            return res.status(401).json({
                success: false,
                error: 'Session expired due to inactivity.',
                code: 'SESSION_EXPIRED',
            });
        }

        const secondsSinceLastSeen = (now - new Date(session.last_seen_at)) / 1000;
        if (secondsSinceLastSeen >= LAST_SEEN_THROTTLE_SECONDS) {
            const newExpiry = new Date(now.getTime() + SESSION_INACTIVITY_MINUTES * 60 * 1000);
            await supabase
                .from('sessions')
                .update({ last_seen_at: now.toISOString(), expires_at: newExpiry.toISOString() })
                .eq('id', session.id);
        }

        req.user = { ...decoded, sessionId: decoded.sessionId };
        next();
    } catch (err) {
        console.error('Session validation error:', err);
        return res.status(500).json({
            success: false,
            error: 'Internal server error during session validation.',
        });
    }
};

export const optionalAuth = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            if (decoded.sessionId) {
                const { data: session } = await supabase
                    .from('sessions')
                    .select('is_active, expires_at')
                    .eq('id', decoded.sessionId)
                    .eq('user_id', decoded.id)
                    .single();

                const valid = session?.is_active && new Date() <= new Date(session.expires_at);
                req.user = valid ? decoded : null;
            } else {
                req.user = null;
            }
        } catch {
            req.user = null;
        }
    }

    next();
};
