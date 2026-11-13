import { Router } from "express";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requireOffice } from "../../middleware/requireOffice.js";
import { list, current, getById, create, update, publish, unpublish, archive, uploadOutline, uploadMiddleware, createSeries, getSeries } from "./bibleStudy.controller.js";
import * as aliasRepo from "./outlineAliases.repository.js";
import * as bookAliasRepo from "./bibleBookAliases.repository.js";
import { sendSuccess } from "../../utils/apiResponse.js";
import { AppError } from "../../errors/appError.js";
import multer from "multer";


export const bibleStudyRouter = Router();



function handleUpload(req: any, res: any, next: any) {
  uploadMiddleware(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError || err instanceof Error) {
      return next(AppError.badRequest(err.message, "INVALID_FILE"));
    }
    next();
  });
}


bibleStudyRouter.get("/current", requireAuth, current);
bibleStudyRouter.get("/aliases", requireAuth, requireOffice("publicity-coordinator"), async (req, res, next) => {
  try {
    const aliases = await aliasRepo.listAliases();
    return sendSuccess(res, aliases);
  } catch (err) {
    next(err);
  }
});
bibleStudyRouter.post("/aliases", requireAuth, requireOffice("publicity-coordinator"), async (req, res, next) => {
  try {
    const { canonicalKey, alias } = req.body;
    if (!canonicalKey || !alias) {
      throw AppError.badRequest("canonicalKey and alias are required", "VALIDATION_ERROR");
    }
    const row = await aliasRepo.addAlias(canonicalKey, alias);
    return sendSuccess(res, row, "Alias added", undefined, 201);
  } catch (err) {
    next(err);
  }
});
bibleStudyRouter.post("/book-aliases", requireAuth, requireOffice("publicity-coordinator"), async (req, res, next) => {
  try {
    const { bookId, alias } = req.body;
    if (!bookId || !alias) {
      throw AppError.badRequest("bookId and alias are required", "VALIDATION_ERROR");
    }
    const row = await bookAliasRepo.addBookAlias(bookId, alias);
    return sendSuccess(res, row, "Book alias added", undefined, 201);
  } catch (err) {
    next(err);
  }
});


bibleStudyRouter.post("/upload-outline", requireAuth, requireOffice("publicity-coordinator"), handleUpload, uploadOutline);

bibleStudyRouter.post("/series", requireAuth, requireOffice("publicity-coordinator"), createSeries);
bibleStudyRouter.get("/series/:id", requireAuth, getSeries);

bibleStudyRouter.get("/", requireAuth, list);
bibleStudyRouter.get("/:id", requireAuth, getById);
bibleStudyRouter.post("/", requireAuth, requireOffice("publicity-coordinator"), create);
bibleStudyRouter.put("/:id", requireAuth, requireOffice("publicity-coordinator"), update);
bibleStudyRouter.patch("/:id/publish", requireAuth, requireOffice("publicity-coordinator"), publish);
bibleStudyRouter.patch("/:id/unpublish", requireAuth, requireOffice("publicity-coordinator"), unpublish);
bibleStudyRouter.patch("/:id/archive", requireAuth, requireOffice("publicity-coordinator"), archive);