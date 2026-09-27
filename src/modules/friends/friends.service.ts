import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Raw } from 'typeorm';
import { Friendship } from './entities/friendship.entity';
import { FriendshipStatus } from './enums/friendship-status.enum';
import { User } from '../users/entities/user.entity';
import { BlocksService } from '../blocks/blocks.service';

function toPublicUser(user: User) {
  const { id, nick, rank, image, totalChipsDeposited } = user;
  return { id, nick, rank, image, totalChipsDeposited };
}

@Injectable()
export class FriendsService {
  constructor(
    @InjectRepository(Friendship)
    private friendshipRepository: Repository<Friendship>,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private blocksService: BlocksService,
  ) {}

  private async findUserByNick(nick: string): Promise<User> {
    const user = await this.usersRepository.findOne({
      where: { nick: Raw((alias) => `LOWER(${alias}) = LOWER(:nick)`, { nick }) },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  private async findById(friendshipId: string): Promise<Friendship> {
    const friendship = await this.friendshipRepository.findOne({ where: { id: friendshipId } });
    if (!friendship) {
      throw new NotFoundException('Friendship not found');
    }
    return friendship;
  }

  private async findPairEitherDirection(userAId: string, userBId: string): Promise<Friendship | null> {
    return this.friendshipRepository.findOne({
      where: [
        { requesterId: userAId, addresseeId: userBId },
        { requesterId: userBId, addresseeId: userAId },
      ],
    });
  }

  async sendRequest(requesterId: string, targetNick: string): Promise<Friendship> {
    const target = await this.findUserByNick(targetNick);
    return this.sendRequestToUser(requesterId, target);
  }

  /** Same flow as sendRequest, resolving the target by userId instead of nick - used by
   * BingoGateway's "añadir amigo" chat action, where the caller already knows the target's real
   * User.id (from BingoPlayer.userId) but not necessarily their current nick (BingoPlayer.username
   * can drift from the linked User.nick after a rename). */
  async sendRequestByUserId(requesterId: string, targetUserId: string): Promise<Friendship> {
    const target = await this.usersRepository.findOne({ where: { id: targetUserId } });
    if (!target) {
      throw new NotFoundException('User not found');
    }
    return this.sendRequestToUser(requesterId, target);
  }

  private async sendRequestToUser(requesterId: string, target: User): Promise<Friendship> {
    if (target.id === requesterId) {
      throw new BadRequestException('No puedes agregarte a ti mismo como amigo');
    }

    if (await this.blocksService.isBlockedEitherDirection(requesterId, target.id)) {
      throw new ForbiddenException('No puedes enviar una solicitud a este usuario');
    }

    const existing = await this.findPairEitherDirection(requesterId, target.id);
    if (existing) {
      if (existing.status === FriendshipStatus.DECLINED) {
        // Let a previously-declined pair try again, as a fresh request from this requester.
        existing.requesterId = requesterId;
        existing.addresseeId = target.id;
        existing.status = FriendshipStatus.PENDING;
        existing.respondedAt = null;
        return this.friendshipRepository.save(existing);
      }
      throw new BadRequestException('Ya existe una solicitud o ya son amigos');
    }

    const friendship = this.friendshipRepository.create({
      requesterId,
      addresseeId: target.id,
      status: FriendshipStatus.PENDING,
    });
    return this.friendshipRepository.save(friendship);
  }

  async acceptRequest(userId: string, friendshipId: string): Promise<Friendship> {
    const friendship = await this.findById(friendshipId);
    if (friendship.addresseeId !== userId) {
      throw new ForbiddenException('No puedes aceptar esta solicitud');
    }
    if (friendship.status !== FriendshipStatus.PENDING) {
      throw new BadRequestException('La solicitud ya fue respondida');
    }
    friendship.status = FriendshipStatus.ACCEPTED;
    friendship.respondedAt = new Date();
    return this.friendshipRepository.save(friendship);
  }

  async declineRequest(userId: string, friendshipId: string): Promise<Friendship> {
    const friendship = await this.findById(friendshipId);
    if (friendship.addresseeId !== userId) {
      throw new ForbiddenException('No puedes rechazar esta solicitud');
    }
    if (friendship.status !== FriendshipStatus.PENDING) {
      throw new BadRequestException('La solicitud ya fue respondida');
    }
    friendship.status = FriendshipStatus.DECLINED;
    friendship.respondedAt = new Date();
    return this.friendshipRepository.save(friendship);
  }

  async cancelRequest(userId: string, friendshipId: string): Promise<void> {
    const friendship = await this.findById(friendshipId);
    if (friendship.requesterId !== userId) {
      throw new ForbiddenException('No puedes cancelar esta solicitud');
    }
    if (friendship.status !== FriendshipStatus.PENDING) {
      throw new BadRequestException('La solicitud ya fue respondida');
    }
    await this.friendshipRepository.remove(friendship);
  }

  async removeFriend(userId: string, friendshipId: string): Promise<void> {
    const friendship = await this.findById(friendshipId);
    if (friendship.requesterId !== userId && friendship.addresseeId !== userId) {
      throw new ForbiddenException('No puedes eliminar esta amistad');
    }
    if (friendship.status !== FriendshipStatus.ACCEPTED) {
      throw new BadRequestException('Esta amistad no está activa');
    }
    await this.friendshipRepository.remove(friendship);
  }

  async listFriends(userId: string): Promise<Array<{ friendshipId: string; user: ReturnType<typeof toPublicUser>; since: Date | null }>> {
    const rows = await this.friendshipRepository.find({
      where: [
        { requesterId: userId, status: FriendshipStatus.ACCEPTED },
        { addresseeId: userId, status: FriendshipStatus.ACCEPTED },
      ],
      relations: ['requester', 'addressee'],
      order: { respondedAt: 'DESC' },
    });

    return rows.map((row) => {
      const other = row.requesterId === userId ? row.addressee : row.requester;
      return { friendshipId: row.id, user: toPublicUser(other), since: row.respondedAt };
    });
  }

  async listIncomingPending(userId: string) {
    const rows = await this.friendshipRepository.find({
      where: { addresseeId: userId, status: FriendshipStatus.PENDING },
      relations: ['requester'],
      order: { createdAt: 'DESC' },
    });
    return rows.map((row) => ({
      friendshipId: row.id,
      user: toPublicUser(row.requester),
      createdAt: row.createdAt,
    }));
  }

  async listOutgoingPending(userId: string) {
    const rows = await this.friendshipRepository.find({
      where: { requesterId: userId, status: FriendshipStatus.PENDING },
      relations: ['addressee'],
      order: { createdAt: 'DESC' },
    });
    return rows.map((row) => ({
      friendshipId: row.id,
      user: toPublicUser(row.addressee),
      createdAt: row.createdAt,
    }));
  }

  async getRelationship(
    userId: string,
    targetUserId: string,
  ): Promise<{ status: string; friendshipId?: string }> {
    if (userId === targetUserId) {
      return { status: 'self' };
    }
    const friendship = await this.findPairEitherDirection(userId, targetUserId);
    if (!friendship || friendship.status === FriendshipStatus.DECLINED) {
      return { status: 'none' };
    }
    if (friendship.status === FriendshipStatus.ACCEPTED) {
      return { status: 'friends', friendshipId: friendship.id };
    }
    if (friendship.requesterId === userId) {
      return { status: 'pending-sent', friendshipId: friendship.id };
    }
    return { status: 'pending-received', friendshipId: friendship.id };
  }
}
