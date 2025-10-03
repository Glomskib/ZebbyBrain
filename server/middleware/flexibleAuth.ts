import { RequestHandler } from "express";
import { isAuthenticated } from "../replitAuth";
import { verifyFirebase } from "./firebaseAuth";

export const flexibleAuth: RequestHandler = async (req, res, next) => {
  const hasBearer = req.headers.authorization?.startsWith("Bearer ");
  
  if (hasBearer) {
    return verifyFirebase(req, res, next);
  } else {
    return isAuthenticated(req, res, next);
  }
};
