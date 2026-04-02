import { Router } from "express";
import { authenticateToken } from "../middleware/auth.js";
import * as armyController from "../controllers/armyController.js";

const router = Router();

router.get("/", authenticateToken, armyController.listArmies);
router.get("/:id", authenticateToken, armyController.getArmy);
router.post("/create", authenticateToken, armyController.createArmy);
router.put("/:id", authenticateToken, armyController.updateArmy);
router.delete("/:id", authenticateToken, armyController.deleteArmy);

export default router;