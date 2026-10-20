import { Injectable } from '@nestjs/common';
import { PrismaService } from '@common/prisma/prisma.service';
import type { Prisma, RequestFile } from '@db';

/** Приватный репозиторий модуля files. Владеет таблицей files. */
@Injectable()
export class FilesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.RequestFileUncheckedCreateInput): Promise<RequestFile> {
    return this.prisma.requestFile.create({ data });
  }

  async findById(id: string): Promise<RequestFile | null> {
    return this.prisma.requestFile.findUnique({ where: { id } });
  }

  async markUploaded(id: string, size: number, uploadedAt: Date): Promise<RequestFile> {
    return this.prisma.requestFile.update({ where: { id }, data: { size, uploadedAt } });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.requestFile.delete({ where: { id } });
  }

  /** Подтверждённые файлы заявки. */
  async listByRequest(requestId: string): Promise<RequestFile[]> {
    return this.prisma.requestFile.findMany({
      where: { requestId, uploadedAt: { not: null } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async countUploadedByRequest(requestId: string): Promise<number> {
    return this.prisma.requestFile.count({ where: { requestId, uploadedAt: { not: null } } });
  }

  /** Черновики пользователя — загруженные до создания заявки. */
  async listDrafts(userId: string): Promise<RequestFile[]> {
    return this.prisma.requestFile.findMany({
      where: { userId, requestId: null },
      orderBy: { createdAt: 'asc' },
    });
  }

  async countDraftsByUser(userId: string): Promise<number> {
    // Считаем только подтверждённые черновики. Неподтверждённая запись — след
    // неудавшейся загрузки: файла за ней нет, и занимать квоту она не должна,
    // иначе десять оборванных попыток запирают человеку загрузку навсегда.
    return this.prisma.requestFile.count({
      where: { userId, requestId: null, uploadedAt: { not: null } },
    });
  }

  /** Привязка черновиков к заявке. Чужие файлы не затрагиваются. */
  async attachToRequest(fileIds: string[], requestId: string, userId: string): Promise<void> {
    await this.prisma.requestFile.updateMany({
      where: { id: { in: fileIds }, userId, requestId: null, uploadedAt: { not: null } },
      data: { requestId },
    });
  }

  /**
   * Есть ли у пользователя файлы, уже привязанные к этой заявке.
   * Используется как проверка «заявка моя» без обращения к чужой таблице.
   */
  async requestBelongsToUserFiles(requestId: string, userId: string): Promise<boolean> {
    const count = await this.prisma.requestFile.count({ where: { requestId, userId } });
    return count > 0;
  }

  /** Неподтверждённые записи старше указанного момента — для фоновой чистки. */
  async listStaleDrafts(olderThan: Date): Promise<RequestFile[]> {
    return this.prisma.requestFile.findMany({
      where: { uploadedAt: null, createdAt: { lt: olderThan } },
    });
  }

  /**
   * Удаляет собственные неподтверждённые записи пользователя старше указанного
   * момента. Иначе следы неудачных загрузок копятся в таблице без срока годности.
   */
  async deleteStaleDraftsOfUser(userId: string, olderThan: Date): Promise<number> {
    const { count } = await this.prisma.requestFile.deleteMany({
      where: { userId, uploadedAt: null, createdAt: { lt: olderThan } },
    });
    return count;
  }
}
