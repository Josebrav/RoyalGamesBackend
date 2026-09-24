import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Trophy } from './entities/trophy.entity';
import { CreateTrophyDto } from './dtos/create-trophy.dto';
import { CloudinaryService } from '../../common/cloudinary/cloudinary.service';

const ALLOWED_IMAGE_MIMETYPES = ['image/jpeg', 'image/png', 'image/webp'];

@Injectable()
export class TrophiesService {
  constructor(
    @InjectRepository(Trophy)
    private readonly trophyRepository: Repository<Trophy>,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  async findByUser(userId: string): Promise<Trophy[]> {
    return this.trophyRepository.find({ where: { userId }, order: { createdAt: 'DESC' } });
  }

  /** Listado completo para la tabla del panel admin, con el nick de cada ganador. */
  async findAll(): Promise<any[]> {
    return this.trophyRepository
      .createQueryBuilder('trophy')
      .leftJoin('trophy.user', 'user')
      .select([
        'trophy.id AS id',
        'trophy.title AS title',
        'trophy.description AS description',
        'trophy.imageUrl AS "imageUrl"',
        'trophy.createdAt AS "createdAt"',
        'trophy.userId AS "userId"',
        'user.nick AS "userNick"',
      ])
      .orderBy('trophy.createdAt', 'DESC')
      .getRawMany();
  }

  async create(file: Express.Multer.File, dto: CreateTrophyDto, awardedBy: string): Promise<Trophy> {
    if (!file) {
      throw new BadRequestException('No se recibió ninguna imagen');
    }
    if (!ALLOWED_IMAGE_MIMETYPES.includes(file.mimetype)) {
      throw new BadRequestException('Formato de imagen no permitido. Usá JPG, PNG o WEBP.');
    }

    const { url, publicId } = await this.cloudinaryService.uploadImage(file.buffer, 'trophies');

    const trophy = this.trophyRepository.create({
      userId: dto.userId,
      title: dto.title,
      description: dto.description ?? null,
      imageUrl: url,
      imagePublicId: publicId,
      awardedBy,
    });
    return this.trophyRepository.save(trophy);
  }

  async remove(id: string): Promise<void> {
    const trophy = await this.trophyRepository.findOne({ where: { id } });
    if (!trophy) {
      throw new NotFoundException('Trophy not found');
    }
    await this.trophyRepository.remove(trophy);
    await this.cloudinaryService.deleteImage(trophy.imagePublicId);
  }
}
